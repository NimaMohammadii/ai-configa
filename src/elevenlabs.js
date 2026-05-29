export async function textToSpeech(env, text, voiceId) {
  if (!env.ELEVEN_API) {
    throw new Error("ELEVEN_API secret is missing");
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": env.ELEVEN_API,
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${errorBody}`);
  }

  return await response.arrayBuffer();
}
