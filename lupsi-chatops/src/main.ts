import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  app.useStaticAssets(join(process.cwd(), 'public'));

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception thrown:', err);
  });

  const port = process.env.PORT || 8090;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 LUPSI Agente activo en puerto ${port}`);
}
bootstrap();
