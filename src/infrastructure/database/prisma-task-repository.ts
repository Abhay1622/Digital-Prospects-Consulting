import { ITaskRepository } from '../../core/repositories/task-repository';
import { Task, TaskStatus } from '../../core/entities/task';
import { prisma } from './prisma-client';

export class PrismaTaskRepository implements ITaskRepository {
  async create(data: { idempotencyKey: string; type: string }): Promise<Task> {
    const record = await prisma.task.create({
      data: {
        idempotencyKey: data.idempotencyKey,
        type: data.type,
        status: 'PENDING',
      },
    });
    return this.toEntity(record);
  }

  async findById(id: string): Promise<Task | null> {
    const record = await prisma.task.findUnique({
      where: { id },
    });
    return record ? this.toEntity(record) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Task | null> {
    const record = await prisma.task.findUnique({
      where: { idempotencyKey: key },
    });
    return record ? this.toEntity(record) : null;
  }

  async findAll(): Promise<Task[]> {
    const records = await prisma.task.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => this.toEntity(r));
  }

  async update(id: string, updates: Partial<Pick<Task, 'status' | 'attempts' | 'result'>>): Promise<Task> {
    const data: any = {};
    if (updates.status) data.status = updates.status;
    if (updates.attempts !== undefined) data.attempts = updates.attempts;
    if (updates.result !== undefined) data.result = updates.result;

    const record = await prisma.task.update({
      where: { id },
      data,
    });
    return this.toEntity(record);
  }

  private toEntity(record: any): Task {
    return {
      id: record.id,
      idempotencyKey: record.idempotencyKey,
      type: record.type,
      status: record.status as TaskStatus,
      attempts: record.attempts,
      result: record.result,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
