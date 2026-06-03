# JUET // SYNC

**JUET Sync** is a modern, fast, and completely redesigned student portal dashboard for Jaypee University of Engineering and Technology (JUET). It acts as an intelligent proxy layer over the university's legacy WebKiosk ERP system.

## The Problem
The official university WebKiosk portal often suffers from poor mobile responsiveness, slow loading times, complex navigation, and frequent session timeouts. Finding critical information like current attendance and recent marks requires navigating through multiple nested menus and deciphering dense tables.

## The Solution
JUET Sync seamlessly scrapes and aggregates data from the official portal in the background, caching it to deliver an instantaneous, unified dashboard experience without modifying the underlying legacy systems.

### Key Features
- **Neo-Brutalist Interface**: A stunning, modern UI built with clean lines, minimalist aesthetics, and accessible high-contrast typography.
- **The Bunk Meter**: Instantly visualize your current attendance percentage, safely calculate how many upcoming classes you can afford to miss, and see exactly which subjects require your immediate attention.
- **Performance Hub**: A centralized breakdown of your SGPA, CGPA, and recent marks mapped to intuitive letter grades.
- **Lightning Fast Caching**: An in-memory/Redis caching layer ensures that once your data is fetched, subsequent loads are practically instant.
- **Persistent Local Sessions**: Your credentials are encrypted and stored locally on your device for seamless background authentication.

## Architecture
This project is built using a modern full-stack monorepo structure:
- **Frontend**: Built with React, Next.js (App Router), TailwindCSS, and Lucide Icons for crisp, fast, and highly responsive user interfaces.
- **Backend**: Powered by Fastify and TypeScript. It utilizes DOM parsing engines (Cheerio) to securely extract unstructured HTML data from the legacy ERP system and format it into clean JSON APIs.
- **Shared**: A unified typed architecture ensuring that the data contracts between the proxy backend and the modern frontend remain strictly typed and error-free.
