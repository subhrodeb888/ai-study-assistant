export type QuizDifficulty = "easy" | "medium" | "hard";

export type QuizQuestion = {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
};

export type Quiz = {
  id: string;
  title: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  createdAt: string;
  questions: QuizQuestion[];
};

export type QuizAttempt = {
  id: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  createdAt: string;
};
