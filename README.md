# Kecalo

RAG chatbot pro pojišťovnu — prototyp jednodenního kurzu vibecodingu. V UI vystupuje jako „Pojišťovna Jistota", znalostní báze čerpá z reálných dokumentů Kooperativy.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Claude API (`claude-sonnet-4-6`) · Voyage AI (`voyage-3.5`) · Supabase (Postgres + pgvector)

## Spuštění lokálně

1. **Klonovat a nainstalovat:**
   ```bash
   git clone https://github.com/xkraust/kecalo.git
   cd kecalo
   npm install
   ```

2. **Nastavit env proměnné:** zkopírovat `.env.example` na `.env.local` a vyplnit hodnoty (viz tabulka níže).

3. **Aplikovat DB migrace:**
   ```bash
   supabase db push --db-url "$DATABASE_URL"
   ```

4. **Spustit dev server:**
   ```bash
   npm run dev
   ```

5. **Otevřít:** [http://localhost:3000](http://localhost:3000) (chat) · [http://localhost:3000/admin](http://localhost:3000/admin) (admin)

## Proměnné prostředí

| Proměnná | Účel |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `VOYAGE_API_KEY` | Voyage AI embeddingy |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase projektu |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin klíč Supabase |
| `DATABASE_URL` | Postgres connection string (pro migrace) |
| `ADMIN_PASSWORD` | Heslo pro admin sekci |
| `TOP_K` | Počet výsledků retrievalu (výchozí: 5) |
| `SIMILARITY_THRESHOLD` | Práh podobnosti (výchozí: 0.35) |
| `LLM_TEMPERATURE` | Teplota Claude (výchozí: 0.2) |
