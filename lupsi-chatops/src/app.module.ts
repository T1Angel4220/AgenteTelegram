import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BotService } from './bot.service';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';
import { AiService } from './ai.service';
import { CronService } from './cron.service';
import { PdfService } from './pdf.service';
import { DocsService } from './docs.service';
import { AutonomyService } from './autonomy.service';
import { WebhookController } from './webhook.controller';

import { ConsistencyService } from './consistency.service';
import { SupabaseService } from './supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, WebhookController],
  providers: [
    AppService,
    BotService,
    TrelloService,
    GithubService,
    ManagerService,
    AiService,
    CronService,
    PdfService,
    DocsService,
    AutonomyService,
    ConsistencyService,
    SupabaseService,
  ],
})
export class AppModule {}
