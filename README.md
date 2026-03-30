# track-yo-shit in Corporate

> Rough notes → Structured insights for Product Managers.

An intelligent, strictly local, AI-powered Project Management Dashboard designed to convert messy spreadsheet notes into structured, actionable intelligence. Built specifically for locked-down corporate environments where speed, data privacy, and lack of installation friction are paramount.

---

## 💼 The Business Value

**The Problem:** 
Product Managers and delivery leads live in spreadsheets. Status updates, meeting notes, and roadmap syncs get dumped into columns as informally written "Rough Notes" (incomplete sentences, mixed thoughts, indirect dependencies). Reading through hundreds of rows to identify timeline risks, blockers, and required actions is tedious and prone to human error.

**The Solution:** 
Upload your Excel tracker, and let an AI act as a highly experienced PM to analyze your updates. 

**Key Business Capabilities:**
- **Automated Risk Identification:** AI parses unstructured text to identify explicit and implicit risks (e.g., timeline shifts, ambiguity).
- **Actionable Next Steps:** Automatically generates structured next steps from raw status updates.
- **Built-in Audit Trails:** Native cell-level edit history tracking. See exactly what changed and when, without needing bloated enterprise software.
- **100% Data Privacy:** Excel data never leaves your machine. Your proprietary project names/metrics stay strictly local.

---

## 🛠 Technical Architecture

Designed from the ground up for **zero-friction deployment** on corporate laptops that block Node.js, npm, or local servers.

- **Stack:** 100% Vanilla HTML, CSS, JavaScript (Zero Build Pipeline, Node.js/NPM completely eradicated).
- **Styling:** Tailwind CSS (via CDN) featuring a custom "Premium Light" theme and custom Inter/Caveat typography.
- **Data Parsing:** SheetJS (via CDN) for robust, in-memory `.xlsx` parsing.
- **State Management & Persistence:** Native **IndexedDB** handles full offline persistence. The application survives page refreshes instantly with zero data loss.
- **AI Integration:** Client-side integration with the **Google Gemini API** (`gemini-3-flash-preview`).
- **Security Architecture:** 
  - "Bring Your Own Key" (BYOK) model. API keys are persisted securely in browser `localStorage`.
  - Local-first design: The uploaded spreadsheet is processed locally, and only the specific row context is sent to the Gemini inference endpoint.

---

## ✨ Features

1. **Instant Excel Uploads:** Drag and drop `.xlsx` files. The app dynamically parses all columns and perfectly replicates your existing structure in the UI.
2. **Context-Aware AI Analysis:** Detects (or injects) a `Rough Notes` column. When triggered, it securely passes the *entire row context* alongside the rough note to Gemini for deeply accurate insights.
3. **Structured AI Insights Mini-Cards:** Replaces plain text with dynamic widgets containing:
   - Attention Badge (HIGH / MEDIUM / LOW)
   - Confidence Score (%)
   - 1-line crisp summary & reason
   - Expandable Risk bullet points
   - Expandable Next Steps
4. **Native Inline Editing:** Click into any cell to edit it instantly, behaving just like a native spreadsheet.
5. **Cell-Level History Tracking:** Every single edit is timestamped. A subtle 'Last updated' label beneath edited cells expands into a full history dropdown (latest → oldest) showing exactly how values evolved.
6. **Robust Session Persistence:** Uses IndexedDB auto-saving. If you accidentally close the tab, the dashboard, parsed data, and cached AI responses instantly reload upon return.

---

## 🚀 How to Run (Zero Setup)

Because it's a completely local application, there are no dependencies to install.

1. Clone or download this repository.
2. **Double-click `index.html`** to open it locally (`file:///...`) in Chrome, Edge, or Safari.
3. Click "Set API Key" in the top right to add your Gemini API Key.
4. Drag and drop your `.xlsx` project tracker into the drop zone.
5. Edit cells manually or click **"Run AI Analysis"** to process your rough notes into insights!
6. *To upload a new file, click "Start Over" in the top right toolbar.*

---

*Designed for Product Managers who want sharp execution without the bloat.*
