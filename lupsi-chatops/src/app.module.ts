import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { BotService } from './bot.service';
import { TrelloService } from './trello.service';
import { GithubService } from './github.service';
import { ManagerService } from './manager.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController],
  providers: [AppService, BotService, TrelloService, GithubService, ManagerService],
})  
export class AppModule { }
