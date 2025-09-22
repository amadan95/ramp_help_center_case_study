# Ramp Help Center Prototype

This workspace contains a full prototype for a metadata-driven redesign of Ramp’s help center, built around live content pulled from `support.ramp.com` via Zendesk.

## Project layout
- `prototype/index.html` – legacy HTML demo of the personalised help center (kept for reference).
- `prototype/presentation.html` – story-driven deck for presenting the concept.
- `docs/system-design.md` – architecture blueprint covering knowledge schema, retrieval, and ops workflows.
- `analysis/raw_text/` – extracted text from the supplied top-article PDFs used during the original HTML prototype.
- `help-center-app/` – the new React Native (Expo) app that renders the live help center experience with Ramp branding.
- `Help-Center-Articles.zip`, `L30D Help Center Usage.csv` – raw materials from the prompt (unchanged).

## Help center app overview (`help-center-app/`)
The Expo app is a web-compatible React Native experience. It loads public Ramp help center data directly from the Zendesk API and layers a metadata model on top for three personas: customers (Human experience), AI retrieval, and operators.

### Data sources
- **Articles, sections, categories**: Fetched from `https://support.ramp.com/api/v2/help_center/en-us/...` using anonymous GET requests. This feeds article bodies, labels, vote counts, and hierarchy.
- **Persona/tier/integration tags**: Inferred client-side by scanning article titles, bodies, section names, and labels with keyword rules (`src/utils/metadata.js`).
- **Signals**: Article vote counts and sums from Zendesk are converted into thumb metrics (`deriveVotes`). Freshness is taken from `updated_at` timestamps.
- **AI chunks**: Each article is converted into a chunk (summary snippet + metadata) to simulate what a RAG system would consume.
- **Usage CSV**: `L30D Help Center Usage.csv` is converted to `help-center-app/data/usage.json`, ensuring all 447 articles appear in the app with view and vote data. Placeholder cards are generated when full article bodies aren’t fetched, so metrics stay complete.

No server-side components are required; all queries occur from the browser via fetch.

### Screen anatomy
1. **Hero metrics**
   - *Live Zendesk feed*: confirms the data set is current, alongside the last synced timestamp.
   - *Key stats*: Articles, sentiment (positive article rate), AI-ready chunk count, and helpful/unhelpful vote percentages stay visible in a concise metrics row so stakeholders can gauge health instantly.

2. **Audience controls** (Filters)
   - Persona, Service tier, Integrations. Clicking a chip updates all downstream views. Persona/tier are mutually exclusive in this prototype (tap to switch), integrations allow multi-select.
   - Options appear based on the metadata inferred from Zendesk content; there is no hardcoded list.

3. **View switcher**
   - Tabs toggle between Human, AI, and Operator experiences.

4. **Human experience view**
   - Article cards display persona/tier badges, Ramp Plus indicators, sentiment pills, last updated, and vote counts. Clicking opens the live article on support.ramp.com.
   - Articles that exist only in the CSV render as usage placeholders with 30‑day view counts and a quick link to search the Help Center for full content.
   - Ordering uses a score blending freshness and sentiment from Zendesk data.

5. **AI retrieval view**
   - Table of RAG chunks, filtered by the same persona/tier/integration controls.
   - Columns explain chunk title, applicable audience, summary text, confidence (based on votes + recency), and whether the chunk is safe for AI (`allowed_for_ai` respects tier gating).

6. **Operator console view**
   - **High impact refresh queue**: Articles with high traffic or negative sentiment, sorted by urgency.
   - **Stale content**: Articles not updated in 90+ days.
   - Cards link back to the source articles for quick editing in Zendesk.

### Branding & design token changes
- Colors align with Ramp’s brand palette (`src/theme.js`): Mine Shaft (`#1F1F1F`) anchors typography, Ripe Lemon (`#E4F222`) highlights key actions, Mule Fawn (`#924F35`) drives secondary accents, Bandicoot (`#787868`) covers neutral text, and Pampas (`#FCFBFA`) softens surfaces.
- Chip, card, and tab styles now use Ramp’s accent colors and subtle shadows to align with existing Ramp UI patterns.
- Typography standardised on Inter with weights echoing Ramp marketing/editorial usage.

### Running the app
```bash
cd help-center-app
npm install           # already run once by create-expo-app
npm run web           # starts Expo in the browser
```
The app fetches data live. If rate-limited, refresh after a minute. To adjust pagination depth or keyword rules, edit `src/hooks/useHelpCenterData.js` (`articlePages`) and `src/utils/metadata.js` respectively.

### Extending the prototype
- Replace heuristic metadata with a server-side classifier and persist taxonomy in a CMS.
- Pipe Zendesk search/ticket telemetry into the dashboard for richer operator cues.
- Add auth context to pre-select persona/tier for logged-in Ramp users.
- Plug the AI view into a real vector store and LLM answer chain to validate retrieval quality.

## Legacy HTML prototype
The previous `prototype/index.html` remains if you need a static, no-build demo using the mocked data generated from the original PDF set. It is no longer the primary experience but can be referenced for comparison.
