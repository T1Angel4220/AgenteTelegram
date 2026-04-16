import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { BotService } from './bot.service';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';
import { AiService } from './ai.service';
import { ScheduleModule } from '@nestjs/schedule'; 
import { CronService } from './cron.service';
import { PdfService } from './pdf.service';
import { DocsService } from './docs.service';

@Module({
  imports: [ConfigModule.forRoot(),
    ScheduleModule.forRoot() 
  ],
  controllers: [AppController],
  providers: [AppService, BotService, TrelloService, GithubService, ManagerService,AiService,CronService,PdfService, DocsService],
})  
export class AppModule { }
