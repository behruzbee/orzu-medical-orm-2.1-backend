export interface IMessage {
  id: string;
  type: 'text' | 'audio' | 'video' | 'image';
  text?: string;
  mediaUrl?: string;
  duration?: string;
  sender: 'operator' | 'patient';
  timestamp: string;
}

export interface IFeedback {
  id: string;
  operatorId: string;
  createdAt: string;
  ratings: Record<string, number>;
  evidenceMessages: IMessage[];
  comment?: string;
}

export interface ICallStatusLog {
  status: string;
  timestamp: string;
  operatorId: string;
  note?: string;
}
