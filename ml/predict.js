/*
 * Educational prediction service.
 *
 * This is deliberately a transparent heuristic fallback for the prototype,
 * not a clinically validated machine-learning model. Replace this module with
 * a trained, validated model before using real medical data or making claims
 * about model performance.
 */
const normalize = (value) => String(value || "").trim().toLowerCase();

const RULES = [
  {
    name: "Common cold",
    symptoms: ["cold", "cough", "sore throat", "runny nose", "congestion", "sneezing"],
    description: "A common respiratory illness. Similar symptoms can have different causes and need professional evaluation when persistent or severe.",
    selfCare: ["Rest and drink adequate fluids.", "Monitor whether symptoms improve or worsen.", "Follow advice from a healthcare professional."],
    contactDoctor: "Contact a healthcare professional if symptoms persist, worsen, or feel unusual for you.",
    emergencySigns: ["Severe difficulty breathing", "Blue lips or face", "Confusion or loss of consciousness"]
  },
  {
    name: "Influenza-like illness",
    symptoms: ["fever", "chills", "cough", "fatigue", "muscle pain", "body ache", "weakness"],
    description: "A flu-like symptom pattern. A clinician may need to assess the timing, severity, and possible causes.",
    selfCare: ["Rest and maintain hydration.", "Monitor temperature and changes in symptoms.", "Avoid close contact with others when acutely unwell."],
    contactDoctor: "Seek professional advice if fever is persistent, symptoms worsen, or you are in a higher-risk group.",
    emergencySigns: ["Severe breathing difficulty", "Chest pain", "Confusion or loss of consciousness"]
  },
  {
    name: "Tension headache pattern",
    symptoms: ["headache", "fatigue", "dizziness", "back pain", "muscle pain"],
    description: "A symptom pattern that can occur with tension or fatigue, but headaches have many possible causes.",
    selfCare: ["Rest in a quiet environment and maintain hydration.", "Notice triggers and changes in intensity.", "Arrange professional advice for new, severe, or recurring headaches."],
    contactDoctor: "Get medical advice for a sudden severe headache, neurological changes, injury, or persistent symptoms.",
    emergencySigns: ["Weakness on one side", "Difficulty speaking", "Loss of consciousness"]
  },
  {
    name: "Gastrointestinal illness pattern",
    symptoms: ["nausea", "vomiting", "diarrhea", "abdominal pain", "loss of appetite", "weakness"],
    description: "A digestive symptom pattern. Dehydration and other causes should be considered by a professional.",
    selfCare: ["Take small, frequent sips of fluids if tolerated.", "Rest and monitor for dehydration.", "Seek advice if symptoms persist or you cannot keep fluids down."],
    contactDoctor: "Contact a clinician for persistent vomiting or diarrhea, severe pain, blood, or signs of dehydration.",
    emergencySigns: ["Severe abdominal pain", "Fainting", "Blood in vomit or stool"]
  },
  {
    name: "Seasonal allergy pattern",
    symptoms: ["sneezing", "runny nose", "skin rash", "cough", "congestion", "fatigue"],
    description: "A possible allergy-related pattern. New or severe reactions require urgent assessment.",
    selfCare: ["Reduce exposure to a suspected trigger where possible.", "Track when symptoms appear and change.", "Discuss persistent or recurring symptoms with a professional."],
    contactDoctor: "Seek medical advice for persistent symptoms or a new reaction.",
    emergencySigns: ["Swelling of lips or tongue", "Severe difficulty breathing", "Fainting"]
  }
];

const RED_FLAGS = new Set([
  "chest pain", "shortness of breath", "loss of consciousness", "severe bleeding",
  "stroke-like symptoms", "severe allergic reaction", "difficulty speaking",
  "weakness on one side", "swelling of lips or tongue"
]);

export function predict(input = {}) {
  const symptoms = [...new Set((input.symptoms || []).map(normalize).filter(Boolean))];
  const urgentSymptoms = symptoms.filter((symptom) => RED_FLAGS.has(symptom));
  let best = RULES[0];
  let bestMatches = -1;
  for (const rule of RULES) {
    const matches = rule.symptoms.filter((symptom) => symptoms.includes(symptom)).length;
    if (matches > bestMatches) {
      best = rule;
      bestMatches = matches;
    }
  }
  return {
    prediction: best.name,
    symptoms,
    description: best.description,
    selfCare: best.selfCare,
    contactDoctor: best.contactDoctor,
    emergencySigns: best.emergencySigns,
    urgent: urgentSymptoms.length > 0,
    urgentSymptoms,
    disclaimer: "This is an informational educational prototype and not a medical diagnosis.",
    model: {
      type: "transparent-heuristic-prototype",
      scoreAvailable: false,
      note: "No probability or confidence score is returned because this prototype does not use a clinically validated probabilistic model."
    }
  };
}

export function supportedSymptoms() {
  return [...new Set(RULES.flatMap((rule) => rule.symptoms))].sort();
}