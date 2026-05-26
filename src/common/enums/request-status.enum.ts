export enum RequestStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  ALL_OK = 'all_ok',
  
  NO_ANSWER = 'no_answer',
  UNREACHABLE = 'unreachable',
  WRONG_NUMBER = 'wrong_number',
  HAS_NOT_WHATSAPP = 'has_not_whatsapp',
  
  DUPLICATE = 'duplicate',
  HAS_NOT_PHONE_NUMBER = 'no_phone',
  OTHER_PROBLEM = 'other',
  
  EMPLOYEE = 'employee',               
  
  FEEDBACK_POSITIVE = 'feedback_pos',
  FEEDBACK_NEGATIVE = 'feedback_neg',
  FEEDBACK_NOT_RELATED = 'feedback_not_related',
}