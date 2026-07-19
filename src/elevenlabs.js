const ELEVEN_TIMEOUT_MS = 80000;
const MAX_TTS_CHARS = 5000;

const ELEVEN_ERROR_MESSAGES = {
  en: {
    missingApi: "The voice service is not configured yet. Please try again later.",
    emptyText: "The text is empty.",
    textTooLong: "The text is too long. Please send a shorter text.",
    timeout: "Voice generation took too long. Please send a shorter text or try again.",
    quota: "The voice service is temporarily out of capacity. Please try again shortly.",
    auth: "Voice service connection error. Please try again shortly.",
    rateLimit: "There are too many requests right now. Please try again in a few moments.",
    unavailable: "The voice service is temporarily unavailable. Please try again shortly.",
    generic: "Voice conversion failed. Please send a shorter text or try again.",
  },
  fa: {
    missingApi: "سرویس تبدیل صدا هنوز تنظیم نشده است. لطفاً بعداً دوباره امتحان کنید.",
    emptyText: "متن خالی است.",
    textTooLong: "متن خیلی طولانی است. لطفاً متن کوتاه‌تری بفرستید.",
    timeout: "ساخت صدا بیش از حد طول کشید. لطفاً متن کوتاه‌تری بفرستید یا دوباره امتحان کنید.",
    quota: "سرویس تبدیل صدا موقتاً ظرفیت ندارد. لطفاً کمی بعد دوباره امتحان کنید.",
    auth: "خطای اتصال به سرویس صدا. لطفاً کمی بعد دوباره امتحان کنید.",
    rateLimit: "درخواست‌ها زیاد شده است. لطفاً چند لحظه بعد دوباره امتحان کنید.",
    unavailable: "سرویس تبدیل صدا موقتاً در دسترس نیست. لطفاً کمی بعد دوباره امتحان کنید.",
    generic: "تبدیل صدا انجام نشد. لطفاً متن کوتاه‌تری بفرستید یا دوباره امتحان کنید.",
  },
  ru: {
    missingApi: "Сервис озвучивания еще не настроен. Попробуйте позже.",
    emptyText: "Текст пустой.",
    textTooLong: "Текст слишком длинный. Отправьте более короткий текст.",
    timeout: "Создание голоса заняло слишком много времени. Отправьте более короткий текст или попробуйте снова.",
    quota: "У сервиса озвучивания временно нет доступной емкости. Попробуйте немного позже.",
    auth: "Ошибка подключения к сервису озвучивания. Попробуйте немного позже.",
    rateLimit: "Сейчас слишком много запросов. Попробуйте через несколько секунд.",
    unavailable: "Сервис озвучивания временно недоступен. Попробуйте немного позже.",
    generic: "Не удалось преобразовать текст в голос. Отправьте более короткий текст или попробуйте снова.",
  },
  de: {
    missingApi: "Der Sprachdienst ist noch nicht eingerichtet. Bitte versuche es später erneut.",
    emptyText: "Der Text ist leer.",
    textTooLong: "Der Text ist zu lang. Bitte sende einen kürzeren Text.",
    timeout: "Die Spracherzeugung hat zu lange gedauert. Bitte sende einen kürzeren Text oder versuche es erneut.",
    quota: "Der Sprachdienst hat vorübergehend keine Kapazität. Bitte versuche es in Kürze erneut.",
    auth: "Verbindungsfehler zum Sprachdienst. Bitte versuche es in Kürze erneut.",
    rateLimit: "Es gibt gerade zu viele Anfragen. Bitte versuche es in ein paar Momenten erneut.",
    unavailable: "Der Sprachdienst ist vorübergehend nicht verfügbar. Bitte versuche es in Kürze erneut.",
    generic: "Die Sprachumwandlung ist fehlgeschlagen. Bitte sende einen kürzeren Text oder versuche es erneut.",
  },
  tr: {
    missingApi: "Ses servisi henüz yapılandırılmadı. Lütfen daha sonra tekrar deneyin.",
    emptyText: "Metin boş.",
    textTooLong: "Metin çok uzun. Lütfen daha kısa bir metin gönderin.",
    timeout: "Ses oluşturma çok uzun sürdü. Lütfen daha kısa bir metin gönderin veya tekrar deneyin.",
    quota: "Ses servisinin kapasitesi geçici olarak dolu. Lütfen kısa süre sonra tekrar deneyin.",
    auth: "Ses servisine bağlantı hatası. Lütfen kısa süre sonra tekrar deneyin.",
    rateLimit: "Şu anda çok fazla istek var. Lütfen birkaç dakika sonra tekrar deneyin.",
    unavailable: "Ses servisi geçici olarak kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.",
    generic: "Ses dönüştürme başarısız oldu. Lütfen daha kısa bir metin gönderin veya tekrar deneyin.",
  },
  ar: {
    missingApi: "خدمة الصوت غير مهيأة بعد. يُرجى المحاولة لاحقاً.",
    emptyText: "النص فارغ.",
    textTooLong: "النص طويل جداً. يُرجى إرسال نص أقصر.",
    timeout: "استغرق إنشاء الصوت وقتاً طويلاً. يُرجى إرسال نص أقصر أو المحاولة مرة أخرى.",
    quota: "خدمة الصوت لا تملك سعة متاحة مؤقتاً. يُرجى المحاولة بعد قليل.",
    auth: "خطأ في الاتصال بخدمة الصوت. يُرجى المحاولة بعد قليل.",
    rateLimit: "هناك عدد كبير من الطلبات الآن. يُرجى المحاولة بعد لحظات.",
    unavailable: "خدمة الصوت غير متاحة مؤقتاً. يُرجى المحاولة بعد قليل.",
    generic: "فشل تحويل النص إلى صوت. يُرجى إرسال نص أقصر أو المحاولة مرة أخرى.",
  },
  zh: {
    missingApi: "语音服务尚未配置。请稍后再试。",
    emptyText: "文本为空。",
    textTooLong: "文本太长。请发送更短的文本。",
    timeout: "生成语音耗时过长。请发送更短的文本或重试。",
    quota: "语音服务暂时没有可用容量。请稍后再试。",
    auth: "语音服务连接错误。请稍后再试。",
    rateLimit: "当前请求过多。请稍等片刻后重试。",
    unavailable: "语音服务暂时不可用。请稍后再试。",
    generic: "语音转换失败。请发送更短的文本或重试。",
  },
  ja: {
    missingApi: "音声サービスはまだ設定されていません。後でもう一度お試しください。",
    emptyText: "テキストが空です。",
    textTooLong: "テキストが長すぎます。短いテキストを送信してください。",
    timeout: "音声生成に時間がかかりすぎました。短いテキストを送信するか、もう一度お試しください。",
    quota: "音声サービスの容量が一時的に不足しています。少し後でもう一度お試しください。",
    auth: "音声サービスへの接続エラーです。少し後でもう一度お試しください。",
    rateLimit: "現在リクエストが多すぎます。しばらくしてからもう一度お試しください。",
    unavailable: "音声サービスは一時的に利用できません。少し後でもう一度お試しください。",
    generic: "音声変換に失敗しました。短いテキストを送信するか、もう一度お試しください。",
  },
  es: {
    missingApi: "El servicio de voz aún no está configurado. Inténtalo de nuevo más tarde.",
    emptyText: "El texto está vacío.",
    textTooLong: "El texto es demasiado largo. Envía un texto más corto.",
    timeout: "La generación de voz tardó demasiado. Envía un texto más corto o inténtalo de nuevo.",
    quota: "El servicio de voz no tiene capacidad temporalmente. Inténtalo de nuevo en breve.",
    auth: "Error de conexión con el servicio de voz. Inténtalo de nuevo en breve.",
    rateLimit: "Hay demasiadas solicitudes ahora. Inténtalo de nuevo en unos momentos.",
    unavailable: "El servicio de voz no está disponible temporalmente. Inténtalo de nuevo en breve.",
    generic: "No se pudo convertir el texto a voz. Envía un texto más corto o inténtalo de nuevo.",
  },
  hi: {
    missingApi: "वॉइस सेवा अभी कॉन्फ़िगर नहीं है। कृपया बाद में फिर कोशिश करें।",
    emptyText: "टेक्स्ट खाली है।",
    textTooLong: "टेक्स्ट बहुत लंबा है। कृपया छोटा टेक्स्ट भेजें।",
    timeout: "आवाज़ बनाने में बहुत ज़्यादा समय लगा। कृपया छोटा टेक्स्ट भेजें या फिर कोशिश करें।",
    quota: "वॉइस सेवा में अस्थायी रूप से क्षमता उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    auth: "वॉइस सेवा से कनेक्शन में त्रुटि। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    rateLimit: "अभी बहुत ज़्यादा अनुरोध हैं। कृपया कुछ देर बाद फिर कोशिश करें।",
    unavailable: "वॉइस सेवा अस्थायी रूप से उपलब्ध नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    generic: "टेक्स्ट को आवाज़ में बदलना विफल रहा। कृपया छोटा टेक्स्ट भेजें या फिर कोशिश करें।",
  },
};

export async function textToSpeech(env, text, voiceId, lang = "en", voiceOptions = null) {
  if (!env.ELEVEN_API) {
    throw new Error(elevenError(lang, "missingApi"));
  }

  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error(elevenError(lang, "emptyText"));
  }

  if (Array.from(cleanText).length > MAX_TTS_CHARS) {
    throw new Error(elevenError(lang, "textTooLong"));
  }

  const voiceSettings = {
    stability: voiceOptions?.stability ?? 0.5,
  };

  const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": env.ELEVEN_API,
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: "eleven_v3",
      voice_settings: voiceSettings,
    }),
  }, lang);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(toFriendlyElevenLabsError(response.status, errorBody, lang));
  }

  return await response.arrayBuffer();
}

async function fetchWithTimeout(url, options, lang) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("elevenlabs_timeout"), ELEVEN_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || String(error).includes("elevenlabs_timeout")) {
      throw new Error(elevenError(lang, "timeout"));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toFriendlyElevenLabsError(status, errorBody, lang) {
  let code = "";
  let message = "";

  try {
    const parsed = JSON.parse(errorBody);
    code = parsed?.detail?.code || parsed?.detail?.type || "";
    message = parsed?.detail?.message || parsed?.message || "";
  } catch {
    message = errorBody || "";
  }

  const raw = `${code} ${message}`.toLowerCase();

  if (raw.includes("quota_exceeded") || raw.includes("quota") || raw.includes("credits remaining")) {
    return elevenError(lang, "quota");
  }

  if (status === 401 || raw.includes("unauthorized") || raw.includes("invalid_api_key")) {
    return elevenError(lang, "auth");
  }

  if (status === 429 || raw.includes("rate") || raw.includes("too many")) {
    return elevenError(lang, "rateLimit");
  }

  if (status >= 500) {
    return elevenError(lang, "unavailable");
  }

  return elevenError(lang, "generic");
}

function elevenError(lang, key) {
  const code = ELEVEN_ERROR_MESSAGES[lang] ? lang : "en";
  return ELEVEN_ERROR_MESSAGES[code]?.[key] || ELEVEN_ERROR_MESSAGES.en[key] || ELEVEN_ERROR_MESSAGES.en.generic;
}
