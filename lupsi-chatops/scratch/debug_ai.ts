import { AiService } from '../src/ai.service';
import { TrelloService } from '../src/trello.service';
import { GithubService } from '../src/github.service';
import { DocsService } from '../src/docs.service';
import { SupabaseService } from '../src/supabase.service';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const trello = new TrelloService();
  const github = new GithubService();
  const supabase = new SupabaseService();
  const docs = new DocsService(supabase); // mock pdf and ai

  // Override getRelevantContext to avoid dependency injection issues
  docs.getRelevantContext = async () => "Contexto vacío de prueba";

  const ai = new AiService(trello, github, docs, supabase);
  
  console.log("Asking AI...");
  const rawResponse = await (ai as any).postWithFailover({
      messages: [{ role: 'system', content: (ai as any).getSuperPrompt({sprint_actual: '1'}, new Date().toISOString(), '', '', '', '', '', '', '') }, { role: 'user', content: 'Como vamos con el proyecto'}],
      max_tokens: 2000
  });

  console.log("RAW CONTENT:");
  console.log(rawResponse.choices[0]?.message?.content);
  console.log("-------------------");

  const result = await ai.chatWithAgent('Como vamos con el proyecto', '123', 'Angel');
  console.log("CLEAN RESULT:");
  console.log(result);
}

run().catch(console.error);
