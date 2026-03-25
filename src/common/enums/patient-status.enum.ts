export enum PatientStatus {
  NEW = 'new',                   // Только упал с сайта
  CONTACTED = 'contacted',       // Оператор связался
  NO_ANSWER = 'no_answer',       // Не поднял трубку
  WRONG_NUMBER = 'wrong_number', // Неверный номер
  UNREACHABLE = 'unreachable',   // Отключен

  FEEDBACK_POSITIVE = 'feedback_positive', // Отзыв ОК
  FEEDBACK_NEGATIVE = 'feedback_negative', // Жалоба
}