import { ensureBalanceRow, getBalance } from "./credits.js";
import { normalizeLang } from "./i18n.js";
import { getState, requireDb } from "./state.js";
import { tgJson } from "./telegram-api.js";

export const REFERRAL_REQUIRED_INVITES = 3;
export const REFERRAL_REWARD_CREDITS = 300;

const SECTION_CODES = Object.freeze({
  tts: "t",
  image: "i",
  explore: "x",
  ai_chat: "c",
  voices: "v",
});

const CODE_SECTIONS = Object.freeze(Object.fromEntries(
  Object.entries(SECTION_CODES).map(([section, code]) => [code, section])
));

let botUsernameCache = "";

export async function ensureReferralTables(env) {
  requireDb(env);
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS referrals (referred_user_id TEXT PRIMARY KEY, referrer_user_id TEXT NOT NULL, source_section TEXT NOT NULL DEFAULT 'tts', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created ON referrals (referrer_user_id, created_at DESC)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS referral_rewards (referrer_user_id TEXT NOT NULL, milestone INTEGER NOT NULL, credits INTEGER NOT NULL DEFAULT 300, credited_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (referrer_user_id, milestone))"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards (referrer_user_id, milestone DESC)"
  ).run();
}

export function normalizeReferralSection(value) {
  const clean = String(value || "").trim().toLowerCase();
  return SECTION_CODES[clean] ? clean : "tts";
}

export function buildReferralStartParam(referrerUserId, section = "tts") {
  const referrer = String(referrerUserId || "").trim();
  if (!/^\d+$/.test(referrer)) throw new Error("Invalid referrer user id");
  return `ref_${referrer}_${SECTION_CODES[normalizeReferralSection(section)]}`;
}

export function parseReferralStartParam(value) {
  const match = String(value || "").trim().match(/^ref_(\d+)_([tixcv])$/i);
  if (!match) return null;
  const section = CODE_SECTIONS[String(match[2]).toLowerCase()];
  if (!section) return null;
  return { referrerUserId: match[1], section };
}

export async function registerReferralFromStartParam(env, referredUserId, startParam) {
  const parsed = parseReferralStartParam(startParam);
  if (!parsed) return { registered: false, reason: "invalid" };

  const referred = String(referredUserId || "").trim();
  const referrer = String(parsed.referrerUserId || "").trim();
  if (!referred || !referrer || referred === referrer) {
    return { registered: false, reason: "self" };
  }

  await ensureReferralTables(env);
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO referrals (referred_user_id, referrer_user_id, source_section, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
  ).bind(referred, referrer, parsed.section).run();

  const changed = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changed <= 0) {
    return { registered: false, reason: "already_registered", status: await getReferralStatus(env, referrer) };
  }

  const statusBeforeGrant = await getReferralStatus(env, referrer, { skipEnsure: true });
  const milestone = Math.floor(statusBeforeGrant.totalInvites / REFERRAL_REQUIRED_INVITES);
  if (milestone > 0) {
    await grantReferralMilestone(env, referrer, milestone);
  }

  return {
    registered: true,
    referrerUserId: referrer,
    section: parsed.section,
    status: await getReferralStatus(env, referrer, { skipEnsure: true }),
  };
}

export async function getReferralStatus(env, userId, options = {}) {
  if (!options.skipEnsure) await ensureReferralTables(env);
  const user = String(userId || "").trim();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM referrals WHERE referrer_user_id = ?"
  ).bind(user).first();
  const rewards = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM referral_rewards WHERE referrer_user_id = ? AND credited_at IS NOT NULL"
  ).bind(user).first();

  const totalInvites = Math.max(0, Number(row?.count || 0));
  const rewardsEarned = Math.max(0, Number(rewards?.count || 0));
  const progress = totalInvites % REFERRAL_REQUIRED_INVITES;
  const remaining = progress === 0 ? REFERRAL_REQUIRED_INVITES : REFERRAL_REQUIRED_INVITES - progress;

  return {
    totalInvites,
    progress,
    remaining,
    requiredInvites: REFERRAL_REQUIRED_INVITES,
    rewardCredits: REFERRAL_REWARD_CREDITS,
    rewardsEarned,
    totalRewardCredits: rewardsEarned * REFERRAL_REWARD_CREDITS,
    balance: await getBalance(env, user),
  };
}

async function grantReferralMilestone(env, referrerUserId, milestone) {
  const referrer = String(referrerUserId);
  const target = Math.max(1, Math.floor(Number(milestone) || 0));
  await ensureBalanceRow(env, referrer);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO referral_rewards (referrer_user_id, milestone, credits, credited_at, created_at) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)"
    ).bind(referrer, target, REFERRAL_REWARD_CREDITS),
    env.DB.prepare(
      "UPDATE user_credits SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND EXISTS (SELECT 1 FROM referral_rewards WHERE referrer_user_id = ? AND milestone = ? AND credited_at IS NULL)"
    ).bind(REFERRAL_REWARD_CREDITS, referrer, referrer, target),
    env.DB.prepare(
      "UPDATE referral_rewards SET credited_at = CURRENT_TIMESTAMP WHERE referrer_user_id = ? AND milestone = ? AND credited_at IS NULL"
    ).bind(referrer, target),
  ]);
}

export async function buildPreparedReferralShare(env, user, section = "tts") {
  const cleanSection = normalizeReferralSection(section);
  const state = await getState(env, user.id);
  const language = normalizeLang(state.language || user.language_code || "en");
  const copy = referralShareCopy(language, cleanSection);
  const username = await getBotUsername(env);
  const startParam = buildReferralStartParam(user.id, cleanSection);
  const inviteUrl = `https://t.me/${username}?startapp=${encodeURIComponent(startParam)}`;
  const resultId = `ref_${SECTION_CODES[cleanSection]}_${Date.now().toString(36)}`.slice(0, 64);

  const prepared = await tgJson(env, "savePreparedInlineMessage", {
    user_id: Number(user.id),
    result: {
      type: "article",
      id: resultId,
      title: copy.previewTitle,
      description: copy.previewDescription,
      input_message_content: {
        message_text: copy.message,
        link_preview_options: { is_disabled: true },
      },
      reply_markup: {
        inline_keyboard: [[{ text: copy.button, url: inviteUrl }]],
      },
    },
    allow_user_chats: true,
    allow_bot_chats: false,
    allow_group_chats: true,
    allow_channel_chats: true,
  });

  return {
    language,
    section: cleanSection,
    inviteUrl,
    preparedMessageId: String(prepared?.id || ""),
    fallbackText: copy.message,
    buttonText: copy.button,
  };
}

export async function getReferralLanguage(env, user) {
  const state = await getState(env, user.id);
  return normalizeLang(state.language || user.language_code || "en");
}

async function getBotUsername(env) {
  if (botUsernameCache) return botUsernameCache;
  const me = await tgJson(env, "getMe");
  const username = String(me?.username || "").replace(/^@/, "").trim();
  if (!username) throw new Error("Bot username is unavailable");
  botUsernameCache = username;
  return username;
}

function referralShareCopy(language, section) {
  const lang = SHARE_COPY[language] ? language : "en";
  const set = SHARE_COPY[lang];
  return set[section] || set.tts;
}

const SHARE_COPY = {
  en: {
    tts: {
      previewTitle: "Try AI Voice",
      previewDescription: "Turn text into natural AI voice",
      message: "🎙 I found this AI voice tool — you can turn any text into a natural, expressive voice in seconds. Try it 👇",
      button: "Open Text to Speech",
    },
    image: {
      previewTitle: "Try AI Images",
      previewDescription: "Create and edit images with AI",
      message: "🎨 This is a really clean AI image tool — create new images or edit your own with a few taps. Try it 👇",
      button: "Open Image Creator",
    },
    explore: {
      previewTitle: "Explore Trending Prompts",
      previewDescription: "Hundreds of free trending image prompts",
      message: "✨ I found an Explore page with hundreds of free trending image prompts. Pick a style, upload your image and make your own version — no prompt writing needed 👇",
      button: "Open Explore",
    },
    ai_chat: {
      previewTitle: "Try the AI Assistant",
      previewDescription: "Chat, create and get things done",
      message: "🐙 I found this AI assistant — chat with it, create things and get help without jumping between apps. Try it 👇",
      button: "Open AI Chat",
    },
    voices: {
      previewTitle: "Explore AI Voices",
      previewDescription: "Find a voice that fits your content",
      message: "🎧 There’s a whole library of AI voices here. You can preview them instantly and use the one that fits your content 👇",
      button: "Open Voices",
    },
  },
  fa: {
    tts: {
      previewTitle: "تبدیل متن به صدا با AI",
      previewDescription: "صدای طبیعی و احساسی در چند ثانیه",
      message: "🎙 یه ابزار خفن پیدا کردم که هر متنی رو توی چند ثانیه به صدای طبیعی و احساسی تبدیل می‌کنه. امتحانش کن 👇",
      button: "ورود به تبدیل متن به صدا",
    },
    image: {
      previewTitle: "ساخت تصویر با AI",
      previewDescription: "ساخت و ادیت تصویر با چند کلیک",
      message: "🎨 این ابزار AI خیلی تمیزه؛ هم می‌تونی تصویر بسازی هم عکس خودتو با چند کلیک ادیت کنی. امتحانش کن 👇",
      button: "ورود به ساخت تصویر",
    },
    explore: {
      previewTitle: "پرامپت‌های ترند اکسپلور",
      previewDescription: "صدها پرامپت رایگان و ترند برای ساخت تصویر",
      message: "✨ یه بخش اکسپلور پیدا کردم که صدها پرامپت رایگان و ترند برای ساخت تصویر داره. فقط استایل رو انتخاب کن، عکستو آپلود کن و نسخه‌ی خودتو بساز؛ بدون نوشتن پرامپت 👇",
      button: "ورود به اکسپلور",
    },
    ai_chat: {
      previewTitle: "دستیار هوش مصنوعی",
      previewDescription: "چت کن، بساز و کارت رو جلو ببر",
      message: "🐙 یه دستیار AI پیدا کردم که می‌تونی باهاش چت کنی، چیز بسازی و خیلی از کاراتو سریع‌تر انجام بدی. امتحانش کن 👇",
      button: "ورود به چت AI",
    },
    voices: {
      previewTitle: "صداهای هوش مصنوعی",
      previewDescription: "صدای مناسب محتوای خودتو پیدا کن",
      message: "🎧 اینجا کلی صدای AI هست که می‌تونی همون لحظه پیش‌نمایششون رو بشنوی و بهترین صدا رو برای محتوات انتخاب کنی 👇",
      button: "ورود به صداها",
    },
  },
  ru: {
    tts: { previewTitle: "AI-озвучка", previewDescription: "Преврати текст в живой голос", message: "🎙 Нашёл классный AI-сервис: любой текст можно за секунды превратить в естественную эмоциональную озвучку. Попробуй 👇", button: "Открыть озвучку" },
    image: { previewTitle: "AI-изображения", previewDescription: "Создавай и редактируй картинки", message: "🎨 Нашёл удобный AI-инструмент для изображений — можно создавать новые картинки и редактировать свои буквально в пару нажатий 👇", button: "Открыть генератор" },
    explore: { previewTitle: "Трендовые промпты", previewDescription: "Сотни бесплатных промптов для изображений", message: "✨ Здесь есть Explore с сотнями бесплатных трендовых промптов для изображений. Выбираешь стиль, загружаешь фото и делаешь свою версию — писать промпт не нужно 👇", button: "Открыть Explore" },
    ai_chat: { previewTitle: "AI-ассистент", previewDescription: "Общайся, создавай и решай задачи", message: "🐙 Нашёл удобного AI-ассистента: можно общаться, создавать контент и быстро решать задачи в одном месте. Попробуй 👇", button: "Открыть AI Chat" },
    voices: { previewTitle: "AI-голоса", previewDescription: "Подбери голос для своего контента", message: "🎧 Тут целая библиотека AI-голосов — можно сразу послушать каждый и выбрать тот, который лучше подходит твоему контенту 👇", button: "Открыть голоса" },
  },
  de: {
    tts: { previewTitle: "KI-Stimme testen", previewDescription: "Text in natürliche Sprache verwandeln", message: "🎙 Ich habe dieses KI-Sprachtool gefunden – damit wird jeder Text in Sekunden zu einer natürlichen, ausdrucksstarken Stimme. Probier es aus 👇", button: "Text-to-Speech öffnen" },
    image: { previewTitle: "KI-Bilder erstellen", previewDescription: "Bilder erstellen und bearbeiten", message: "🎨 Dieses KI-Bildtool ist richtig praktisch – neue Bilder erstellen oder eigene Fotos mit wenigen Klicks bearbeiten. Probier es aus 👇", button: "Bildgenerator öffnen" },
    explore: { previewTitle: "Trend-Prompts entdecken", previewDescription: "Hunderte kostenlose Bild-Prompts", message: "✨ Im Explore-Bereich gibt es Hunderte kostenlose, aktuelle Bild-Prompts. Stil auswählen, Bild hochladen und deine eigene Version erstellen – ganz ohne Prompt-Schreiben 👇", button: "Explore öffnen" },
    ai_chat: { previewTitle: "KI-Assistent testen", previewDescription: "Chatten, erstellen und Aufgaben lösen", message: "🐙 Ich habe diesen KI-Assistenten gefunden – chatten, Inhalte erstellen und Aufgaben an einem Ort erledigen. Probier ihn aus 👇", button: "AI Chat öffnen" },
    voices: { previewTitle: "KI-Stimmen entdecken", previewDescription: "Finde die passende Stimme", message: "🎧 Hier gibt es eine ganze Bibliothek mit KI-Stimmen. Du kannst sie sofort anhören und die passende für deinen Content auswählen 👇", button: "Stimmen öffnen" },
  },
  tr: {
    tts: { previewTitle: "AI Seslendirme", previewDescription: "Metni doğal sese dönüştür", message: "🎙 Çok iyi bir AI ses aracı buldum — istediğin metni saniyeler içinde doğal ve duygulu bir sese dönüştürebiliyorsun. Dene 👇", button: "Metinden Sese Aç" },
    image: { previewTitle: "AI Görsel Oluştur", previewDescription: "Görsel üret ve düzenle", message: "🎨 Çok temiz bir AI görsel aracı — yeni görseller oluşturabilir veya kendi fotoğraflarını birkaç dokunuşla düzenleyebilirsin 👇", button: "Görsel Oluşturucuyu Aç" },
    explore: { previewTitle: "Trend Promptları Keşfet", previewDescription: "Yüzlerce ücretsiz görsel promptu", message: "✨ Explore bölümünde yüzlerce ücretsiz ve trend görsel promptu var. Stili seç, fotoğrafını yükle ve kendi versiyonunu oluştur — prompt yazmana gerek yok 👇", button: "Explore'u Aç" },
    ai_chat: { previewTitle: "AI Asistan", previewDescription: "Sohbet et, üret ve işlerini hallet", message: "🐙 Güzel bir AI asistan buldum — sohbet edebilir, içerik üretebilir ve işlerini tek yerde hızlandırabilirsin. Dene 👇", button: "AI Chat'i Aç" },
    voices: { previewTitle: "AI Sesleri", previewDescription: "İçeriğine uygun sesi bul", message: "🎧 Burada kocaman bir AI ses kütüphanesi var. Sesleri anında dinleyip içeriğine en uygun olanı seçebilirsin 👇", button: "Sesleri Aç" },
  },
  ar: {
    tts: { previewTitle: "تحويل النص إلى صوت", previewDescription: "صوت طبيعي بالذكاء الاصطناعي", message: "🎙 وجدت أداة ذكاء اصطناعي رائعة تحوّل أي نص خلال ثوانٍ إلى صوت طبيعي ومعبّر. جرّبها 👇", button: "فتح تحويل النص إلى صوت" },
    image: { previewTitle: "إنشاء صور بالذكاء الاصطناعي", previewDescription: "أنشئ الصور وعدّلها بسهولة", message: "🎨 هذه أداة صور بالذكاء الاصطناعي بسيطة وقوية — أنشئ صورًا جديدة أو عدّل صورك ببضع نقرات 👇", button: "فتح منشئ الصور" },
    explore: { previewTitle: "استكشف البرومبتات الرائجة", previewDescription: "مئات البرومبتات المجانية للصور", message: "✨ وجدت قسم Explore فيه مئات البرومبتات المجانية والرائجة لصناعة الصور. اختر الستايل، ارفع صورتك واصنع نسختك بدون كتابة برومبت 👇", button: "فتح Explore" },
    ai_chat: { previewTitle: "مساعد الذكاء الاصطناعي", previewDescription: "دردشة وإنشاء وإنجاز المهام", message: "🐙 وجدت مساعد ذكاء اصطناعي مفيد — دردش معه، أنشئ محتوى وأنجز مهامك من مكان واحد. جرّبه 👇", button: "فتح AI Chat" },
    voices: { previewTitle: "أصوات الذكاء الاصطناعي", previewDescription: "اختر الصوت المناسب لمحتواك", message: "🎧 هنا مكتبة كاملة من أصوات الذكاء الاصطناعي. اسمع المعاينة فورًا واختر الصوت الأنسب لمحتواك 👇", button: "فتح الأصوات" },
  },
  zh: {
    tts: { previewTitle: "AI 配音", previewDescription: "把文字变成自然语音", message: "🎙 我发现了一个很好用的 AI 配音工具，几秒钟就能把文字变成自然、有表现力的声音。试试吧 👇", button: "打开文字转语音" },
    image: { previewTitle: "AI 图片", previewDescription: "快速生成和编辑图片", message: "🎨 这个 AI 图片工具很方便，可以快速生成新图片，也能轻松编辑你自己的照片 👇", button: "打开图片生成器" },
    explore: { previewTitle: "探索热门提示词", previewDescription: "数百个免费热门图片提示词", message: "✨ Explore 里有数百个免费的热门图片提示词。选一个风格、上传你的图片，就能做出自己的版本，不用自己写提示词 👇", button: "打开 Explore" },
    ai_chat: { previewTitle: "AI 助手", previewDescription: "聊天、创作和处理任务", message: "🐙 我发现了一个很实用的 AI 助手，可以聊天、创作内容，也能帮你更快处理各种任务。试试吧 👇", button: "打开 AI Chat" },
    voices: { previewTitle: "AI 声音库", previewDescription: "找到适合内容的声音", message: "🎧 这里有一个很丰富的 AI 声音库，可以直接试听，再选最适合你内容的声音 👇", button: "打开声音库" },
  },
  ja: {
    tts: { previewTitle: "AI 音声", previewDescription: "テキストを自然な声に変換", message: "🎙 使いやすいAI音声ツールを見つけたよ。テキストを数秒で自然で表現力のある音声にできる。試してみて 👇", button: "テキスト読み上げを開く" },
    image: { previewTitle: "AI画像", previewDescription: "画像を生成・編集", message: "🎨 シンプルで使いやすいAI画像ツール。新しい画像を作ったり、自分の写真を数タップで編集できるよ 👇", button: "画像生成を開く" },
    explore: { previewTitle: "トレンドプロンプト", previewDescription: "無料の画像プロンプトが数百種類", message: "✨ Exploreには無料のトレンド画像プロンプトが数百種類。スタイルを選んで写真をアップするだけで、自分版を作れる。プロンプトを書く必要なし 👇", button: "Exploreを開く" },
    ai_chat: { previewTitle: "AIアシスタント", previewDescription: "チャット・作成・タスクを一か所で", message: "🐙 便利なAIアシスタントを見つけたよ。チャット、コンテンツ作成、タスクのサポートまで一か所でできる 👇", button: "AI Chatを開く" },
    voices: { previewTitle: "AI音声ライブラリ", previewDescription: "コンテンツに合う声を見つける", message: "🎧 AI音声がたくさん揃っていて、すぐに試聴してコンテンツに合う声を選べるよ 👇", button: "音声を開く" },
  },
  es: {
    tts: { previewTitle: "Voz con IA", previewDescription: "Convierte texto en una voz natural", message: "🎙 Encontré esta herramienta de voz con IA: convierte cualquier texto en una voz natural y expresiva en segundos. Pruébala 👇", button: "Abrir texto a voz" },
    image: { previewTitle: "Imágenes con IA", previewDescription: "Crea y edita imágenes", message: "🎨 Encontré una herramienta de imágenes con IA muy limpia: crea imágenes nuevas o edita las tuyas en unos pocos toques 👇", button: "Abrir creador de imágenes" },
    explore: { previewTitle: "Prompts en tendencia", previewDescription: "Cientos de prompts gratuitos para imágenes", message: "✨ Explore tiene cientos de prompts gratuitos y en tendencia para crear imágenes. Elige un estilo, sube tu foto y crea tu propia versión sin escribir prompts 👇", button: "Abrir Explore" },
    ai_chat: { previewTitle: "Asistente con IA", previewDescription: "Chatea, crea y resuelve tareas", message: "🐙 Encontré este asistente con IA: puedes chatear, crear contenido y resolver tareas desde un solo lugar. Pruébalo 👇", button: "Abrir AI Chat" },
    voices: { previewTitle: "Voces con IA", previewDescription: "Encuentra la voz ideal para tu contenido", message: "🎧 Aquí hay toda una biblioteca de voces con IA. Puedes escucharlas al instante y elegir la que mejor encaje con tu contenido 👇", button: "Abrir voces" },
  },
  hi: {
    tts: { previewTitle: "AI Voice", previewDescription: "टेक्स्ट को नैचुरल आवाज़ में बदलें", message: "🎙 मुझे यह AI voice tool मिला — किसी भी text को कुछ ही सेकंड में natural और expressive voice में बदल सकते हो। Try करो 👇", button: "Text to Speech खोलें" },
    image: { previewTitle: "AI Images", previewDescription: "AI से images बनाएँ और edit करें", message: "🎨 यह AI image tool काफी clean है — नई images बना सकते हो या अपनी photos को कुछ taps में edit कर सकते हो 👇", button: "Image Creator खोलें" },
    explore: { previewTitle: "Trending Prompts", previewDescription: "सैकड़ों free image prompts", message: "✨ Explore में सैकड़ों free और trending image prompts हैं। Style चुनो, अपनी image upload करो और बिना prompt लिखे अपना version बना लो 👇", button: "Explore खोलें" },
    ai_chat: { previewTitle: "AI Assistant", previewDescription: "Chat, create और काम पूरा करें", message: "🐙 मुझे यह AI assistant मिला — chat कर सकते हो, content बना सकते हो और कई काम एक ही जगह जल्दी कर सकते हो। Try करो 👇", button: "AI Chat खोलें" },
    voices: { previewTitle: "AI Voices", previewDescription: "अपने content के लिए सही voice चुनें", message: "🎧 यहाँ AI voices की पूरी library है। तुरंत preview सुनो और अपने content के लिए सबसे सही voice चुनो 👇", button: "Voices खोलें" },
  },
};
