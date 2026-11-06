import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient | null = null;

  onModuleInit() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      console.log('✅ Supabase conectado para persistencia de sesiones.');
    } else {
      console.warn('⚠️ SUPABASE_URL o SUPABASE_KEY no configurados. Las sesiones no serán persistentes en la nube.');
    }
  }

  async saveSession(chatId: string, messages: any[]) {
    if (!this.supabase) return;

    try {
      const { error } = await this.supabase
        .from('lupsi_sessions')
        .upsert({ 
          id: chatId, 
          messages: messages.slice(-15), // Guardar los últimos 15 mensajes
          updated_at: new Date().toISOString() 
        });

      if (error) console.error('Error guardando sesión en Supabase:', error.message);
    } catch (e) {
      console.error('Error crítico en Supabase Save:', e);
    }
  }

  async getSession(chatId: string): Promise<any[] | null> {
    if (!this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('lupsi_sessions')
        .select('messages')
        .eq('id', chatId)
        .single();

      if (error || !data) return null;
      return data.messages;
    } catch (e) {
      return null;
    }
  }

  async getAllSessions(): Promise<Record<string, any[]>> {
    if (!this.supabase) return {};

    try {
      const { data, error } = await this.supabase
        .from('lupsi_sessions')
        .select('*');

      if (error || !data) return {};

      const sessions: Record<string, any[]> = {};
      data.forEach(row => {
        sessions[row.id] = row.messages;
      });
      return sessions;
    } catch (e) {
      return {};
    }
  }
}
