export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Task {
  id: string;
  idempotencyKey: string;
  type: string;
  status: TaskStatus;
  attempts: number;
  result: any;
  createdAt: Date;
  updatedAt: Date;
}
