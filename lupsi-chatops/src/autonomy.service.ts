import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AutonomyService {
  private readonly filePath = path.join(process.cwd(), 'decisiones_pendientes.json');

  constructor() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([]));
    }
  }

  saveDecision(decision: any) {
    const decisions = this.getPendingDecisions();
    const id = Math.random().toString(36).substring(2, 10);
    decisions.push({ id, ...decision, createdAt: new Date().toISOString() });
    fs.writeFileSync(this.filePath, JSON.stringify(decisions, null, 2));
    return id;
  }

  getPendingDecisions() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  deleteDecision(id: string) {
    const decisions = this.getPendingDecisions().filter(d => d.id !== id);
    fs.writeFileSync(this.filePath, JSON.stringify(decisions, null, 2));
  }
}
