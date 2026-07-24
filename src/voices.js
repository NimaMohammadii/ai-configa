export const VOICES = {
  Liam: "TX3LPaxmHKxFdv7VOQHJ",
  Noah: "1SM7GgM6IMuvQlz2BwM3",
  Ava: "tnSpp4vdxKPjI9w0GnoV",
  Nora: "BIvP0GN1cAtSRTxNHnWS",
  Alex: "GFGuOkimbpNkTEOVDkqX",
  Ella: "NZiuR1C6kVMSWHG27sIM",
  Chloe: "BZgkqPqms7Kj9ulSkVzn",
  Alexandra: "kdmDKE6EkgrWrrykO9Qt",
  Laura: "7piC4m7q8WrpEAnMj5xC",
  Maxon: "0dPqNXnhg2bmxQv1WKDp",
  Jessica: "cgSgspJ2msm6clMCkdW9",
  Austin: "Bj9UqZbhQsanLzgalpEG",
  priyanka: "BpjGufoPiobT79j2vtj4",
  horatius: "qXpMhyvQqiRxWQs4qSSB",
  Nova: "rNb3hdSf0n4ROIbYC8Bl",
  James: "6OzrBCQf8cjERkYgzSg8",
  Xavier: "YOq2y2Up4RgXP2HyXjE5",
  Lucas: "NNl6r8mD7vthiJatiJt1",
  Lana: "bD9maNcCuQQS75DGuteM",
  Amanda: "oi8rgjIfLgJRsQ6rbZh3",
  Scarlett: "nTkjq09AuYgsNR8E4sDe",
  Aurora: "eUdJpUEN3EslrgE24PKx",
  Allison: "1wGbFxmAM3Fgw63G1zZJ",
  Mason: "fXhoW006nc5Wf8xkGVSy",
  Aria: "evlmNgTfQhTg1om8fCgp",
  Selena: "h60rOzgfLmYsntfqgGu2",
  Vespera: "FvmvwvObRqIHojkEGh5N",
  Elara: "tTQzD8U9VSnJgfwC6HbY",
  Atlas: "3OUAuH7CeDSQhCCijs1Y",
  Mira: "rEVYTKPqwSMhytFPayIb",
  Zoya: "eXpIbVcVbLo8ZJQDlDnl",
  Kiara: "8DzKSPdgEQPaK5vKG0Rs",
  Orion: "qDuRKMlYmrm8trt5QyBn",
  Ryder: "7EzWGsX10sAS4c9m9cPf",
  Lyra: "k9KXsQFJqzAoomTCOrJB",
  Zane: "G4IAP30yc6c1gK0csDfu",
  Knox: "Q0Et7LOU7VpeoeCRQAVS",
  Jaxon: "rPNcQ53R703tTmtue1AT",
  Ace: "FG5LWkFkrS271U9F0p13",
  Cruz: "id7LQ3n0ft94moeTT1ER",
  Neo: "QHn1B5TtjcHcHQhihK04",
  Skye: "cbqdgvVi3C6sgxIWpqIh",
  Kairo: "NvA7c85NkZVpFBAHHQQ3",
  Sia: "uYXf8XasLslADfZ2MB4u",
  Milo: "av1BMOR1GPgThz9p4fLo",
  Rhea: "a1KZUXKFVFDOb33I1uqr",
};

export const LOCKED_VOICE_NAMES = ["Vespera"];
export const LOCKED_VOICES = Object.fromEntries(LOCKED_VOICE_NAMES.map((name) => [name, VOICES[name]]));

export function isLockedVoice(voiceNameOrId) {
  const value = String(voiceNameOrId || "").trim();
  return LOCKED_VOICE_NAMES.includes(value) || Object.values(LOCKED_VOICES).includes(value);
}


export const VOICE_NAMES = Object.keys(VOICES);
export const VOICES_PER_PAGE = 8;
