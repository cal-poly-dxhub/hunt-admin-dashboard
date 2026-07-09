# Collaboration

Thanks for your interest in our solution. Having specific examples of replication and cloning allows us to continue to grow and scale our work. If you clone or download this repository, kindly shoot us a quick email to let us know you are interested in this work!

[wwps-cic@amazon.com]

---

# Disclaimers 

**Customers are responsible for making their own independent assessment of the information in this document.** 

**This document:** 

(a) is for informational purposes only, 

(b) references AWS product offerings and practices, which are subject to change without notice, 

(c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided "as is" without warranties, representations, or conditions of any kind, whether express or implied. The responsibilities and liabilities of AWS to its customers are controlled by AWS agreements, and this document is not part of, nor does it modify, any agreement between AWS and its customers, and 

(d) is not to be considered a recommendation or viewpoint of AWS. 

**Additionally, you are solely responsible for testing, security and optimizing all code and assets on GitHub repo, and all such code and assets should be considered:** 

(a) as-is and without warranties or representations of any kind, 

(b) not suitable for production environments, or on production or other critical data, and 

(c) to include shortcuts in order to support rapid prototyping such as, but not limited to, relaxed authentication and authorization and a lack of strict adherence to security best practices. 

**All work produced is open source. More information can be found in the GitHub repo.**

---

# Hunt Admin Dashboard

A real-time admin dashboard for monitoring a campus scavenger hunt at Cal Poly SLO. Built with React, Mapbox GL, and AWS CDK.

## Overview

This dashboard allows event administrators to monitor team progress, view live GPS locations, and receive real-time notifications when teams reach checkpoints during a duck-hunt style scavenger hunt.

### Features

- **Live Map** — Full-screen Mapbox map showing real-time team member locations with color-coded markers, duck/checkpoint overlays, and trail history
- **Progress Tracking** — Per-team level completion with live timers, elapsed time calculations, and sortable views (Best, Fastest, Recent, Alphabetical)
- **Checkpoint Notifications** — Real-time toasts when teams upload photos at checkpoints, triggered by S3 events
- **Photo Viewer** — Modal to view team checkpoint photos via presigned S3 URLs
- **Master Stopwatch** — Running timer since game start, visible on all pages
- **Map Controls** — Toggle ducks, POI labels, road labels, trails; center on teams; reset view (persisted to localStorage)
- **Settings** — Notification toggle, fullscreen mode

## Architecture

```
Browser (React + Vite + Tailwind)
  │
  ├── CloudFront Distribution
  │     ├── / → S3 (frontend static assets)
  │     └── /api/* → API Gateway (prod stage)
  │
  ├── API Gateway → Lambda
  │     ├── GET /api/games
  │     ├── GET /api/games/{gameId}/teams
  │     ├── GET /api/teams/{teamId}/progress
  │     ├── GET /api/teams/{teamId}/coords?since=
  │     ├── GET /api/events?since=
  │     └── GET /api/photo-url?key=
  │
  └── S3 (photo-bucket)
        └── PutObject → Lambda → DynamoDB (CHECKPOINT_EVENT)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS v4, Mapbox GL JS, React Router |
| Infrastructure | AWS CDK (TypeScript) |
| Compute | AWS Lambda (Node.js 22) |
| Storage | Amazon DynamoDB, Amazon S3 |
| Delivery | Amazon CloudFront, API Gateway |

## Getting Started

### Prerequisites

- Node.js 22+
- AWS CLI configured with appropriate profile
- Mapbox account and access token

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Add your Mapbox token
echo "VITE_MAPBOX_TOKEN=your_token_here" > frontend/.env

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install lambda dependencies
cd lambda && npm install && cd ..
```

### Local Development

```bash
cd frontend && npx vite
```

The dev server proxies `/api/*` to the deployed API Gateway.

### Deploy

```bash
cd frontend && npm run build && cd ..
source .env && npx cdk deploy --profile <your-profile>
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DUCK_HUNT_TABLE_NAME` | DynamoDB table name |
| `PHOTO_BUCKET_NAME` | S3 bucket for team photos |
| `AWS_REGION` | AWS region |
| `AWS_ACCOUNT` | AWS account ID |
| `VITE_MAPBOX_TOKEN` | Mapbox GL access token (frontend) |

## Project Structure

```
├── bin/app.ts                  # CDK app entry point
├── lib/dashboard-stack.ts      # CDK stack definition
├── lambda/src/
│   ├── games.ts                # GET /api/games
│   ├── teams.ts                # GET /api/games/{gameId}/teams
│   ├── progress.ts             # GET /api/teams/{teamId}/progress
│   ├── coords.ts               # GET /api/teams/{teamId}/coords
│   ├── events.ts               # GET /api/events
│   ├── photo-url.ts            # GET /api/photo-url (presigned URLs)
│   ├── s3-event.ts             # S3 trigger for checkpoint events
│   └── shared.ts               # Shared utilities
├── frontend/
│   ├── public/                 # Static assets (duck marker SVG, logos)
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── hooks/              # Data fetching hooks
│   │   ├── lib/                # API client, color palette
│   │   └── data/               # Duck checkpoint locations
│   └── vite.config.ts
└── .env.example
```
