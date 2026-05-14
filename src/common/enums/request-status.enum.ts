export enum RequestStatus {
  NEW = 'new',                         // Только поступил с сайта
  CONTACTED = 'contacted',             // Оператор связался
  ALL_OK = 'all_ok',                   // Все ОК, перезвон не требуется
  
  NO_ANSWER = 'no_answer',             // Не поднял трубку
  UNREACHABLE = 'unreachable',         // Вне зоны доступа / Отключен
  WRONG_NUMBER = 'wrong_number',       // Неверный номер
  HAS_NOT_WHATSAPP = 'has_not_whatsapp', // Нет мессенджера
  
  FEEDBACK_POSITIVE = 'feedback_pos',  // Положительный отзыв
  FEEDBACK_NEGATIVE = 'feedback_neg',  // Жалоба / Отрицательный отзыв
  FEEDBACK_NOT_RELATED = 'feedback_not_related', // Жалоба не относится к клинике
}