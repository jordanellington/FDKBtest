# FDKB Navigator - Design Document

## Overview
Modern front-end POC for the Covington & Burling Food & Drug Knowledge Base (FDKB), replacing the legacy Alfresco 5.2 Share UI. Dockerized for local dev and AWS ECS deployment.

## Backend
- Alfresco Community 5.2.0 at secure.covi3.com
- CAS 5.2.0 SSO at secure-login.covi3.com
- 368,261 documents, primarily PDFs, spanning 1947-present
- POC scope: Biosimilars subfolder (~1,600 documents)

## Architecture
- Frontend: React 18 + Vite + TailwindCSS + Framer Motion
- Backend: Node.js/Express API proxy
- Docker Compose: two services (frontend :5173, backend :3001)
- Auth: Alfresco ticket API for dev, CAS SSO for production

## Features
1. Login page (ticket API + CAS "Coming Soon")
2. Dashboard with stats and category cards
3. Document browser with folder tree and list view
4. Full-text search with facets
5. PDF viewer with metadata panel
6. Distribution rights tracking per document
7. AI Research Assistant chat panel (Coming Soon placeholder)

## Aesthetic
- Editorial luxury + legal precision
- Dark mode: deep charcoal (#0F1419) with gold accents (#C9A84C)
- Typography: Playfair Display (headings) + DM Sans (body)
- Framer Motion animations for transitions and reveals
