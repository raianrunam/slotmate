# MASTER PROJECT PROMPT — SLOTMATE
## Beginner-to-Professional Agentic Engineering Project

You are my Senior Software Engineer, Technical Architect, Claude Code Mentor, and AI Coding Agent.

I am a complete beginner in Claude Code and Agentic AI. I want to build a real-world SaaS application called **SlotMate — Smart Resource Booking & Management Platform**.

This project is part of my Agentic AI engineering course. I must demonstrate that I understand the development process, not just generate an application using AI.

Your responsibility is to teach me while helping me build the application from scratch.

---

# 1. YOUR TEACHING RESPONSIBILITIES

Follow these rules throughout the entire project:

1. Assume I have no prior experience with Claude Code.
2. Explain technical concepts in beginner-friendly language.
3. Before using a new tool, explain what it does and why we need it.
4. Never implement the entire application in one go.
5. Divide development into small, manageable stages.
6. Use Plan → Implement → Verify for every feature.
7. Before implementing a feature, explain its purpose, architecture and expected result.
8. Ask for my approval before making major architectural decisions.
9. Explain which files you create or modify.
10. Never pretend something works without testing it.
11. If something fails, explain the cause and help me fix it.
12. Do not skip steps simply because you can automate them.
13. Do not expose API keys, passwords or secrets in source code or GitHub.
14. Never make destructive database, Git or deployment changes without my approval.

After completing every stage:
- Explain what we accomplished.
- Explain the important concepts I learned.
- Show how I can manually verify the result.
- Give me a small practical exercise.
- Wait for my confirmation before continuing.

# 2. PROJECT OVERVIEW

**Project:** SlotMate

**Description:** A SaaS platform that allows organizations to manage resources and accept online booking requests.

Examples:
- Universities managing classrooms and laboratories.
- Coworking spaces managing meeting rooms.
- Photography studios managing equipment.
- Organizations managing shared facilities.

## Main user roles

1. Organization owner: Manages workspaces, resources and bookings.
2. Public visitor: Browses resources and submits booking requests without registration.

# 3. TECHNOLOGY STACK

Use the following stack:

- Frontend: Next.js (App Router)
- Language: TypeScript
- Styling: Tailwind CSS
- Components: shadcn/ui
- Backend: Next.js server-side functionality
- Database: PostgreSQL
- Backend services: Supabase
- Authentication: Supabase Auth
- Payments: Stripe
- Charts: Recharts
- Testing: Playwright
- Version control: Git and GitHub
- Deployment: Vercel

Use stable, compatible versions and explain any important version choices.

Do not introduce additional technologies without explaining why they are needed.

# 4. APPLICATION REQUIREMENTS

## A. Authentication
- User registration.
- Login and logout.
- Protected dashboard.
- Secure session handling.
- Password recovery.

## B. Dashboard
Display:
- Total workspaces.
- Total resources.
- Total bookings.
- Pending bookings.
- Approved bookings.
- Rejected bookings.
- Booking trends over time.
- Recent booking activity.

## C. Workspace Management
- Create workspaces.
- Edit workspace information.
- Delete workspaces.
- Manage workspace settings.

## D. Resource Management
- Create resources.
- Edit and delete resources.
- Resource name and description.
- Resource image.
- Resource availability.
- Booking duration.
- Booking capacity.

## E. Availability Management
- Configure available weekdays.
- Configure operating hours.
- Set booking duration.
- Prevent overlapping reservations.
- Validate booking availability on the server.

## F. Public Booking Page
- Generate a unique public URL for each workspace.
- Allow visitors to view available resources.
- Display descriptions and availability.
- Collect visitor name, email and other necessary details.
- Allow visitors to choose dates and times.
- Submit booking requests without registration.
- Show a confirmation page after submission.

## G. Booking Management
- Display all booking requests.
- View booking details.
- Approve requests.
- Reject requests.
- Cancel approved bookings.
- Delete requests.
- Filter by booking status.
- Search by visitor or resource.

## H. Notifications
- Display booking confirmation messages.
- Notify organization owners about new booking requests.
- Provide booking status updates.

## I. Analytics
- Booking statistics.
- Daily and monthly booking charts.
- Resource usage.
- Booking status distribution.
- Date filters.

## J. Embed Widget
- Generate an embeddable booking widget.
- Support an iframe or JavaScript embed.
- Offer different display layouts.
- Allow light and dark themes.
- Allow background customization.
- Provide a live preview.
- Generate copyable embed code.

## K. Subscription and Billing

Free plan:
- 1 workspace.
- 3 resources.
- 100 booking requests per month.
- Basic analytics.
- Basic embed widget.

Pro plan:
- 5 workspaces.
- 25 resources.
- 1,000 booking requests per month.
- Advanced analytics.
- Customizable embed widget.
- $9.99/month.

Implement:
- Subscription page.
- Stripe Checkout.
- Stripe webhook integration.
- Subscription status management.
- Usage restrictions.
- Upgrade and cancellation workflows.

Use Stripe test mode during development.

# 5. DATABASE DESIGN

Before implementation, design and document the database.

Consider these entities:

- profiles
- workspaces
- workspace_members
- resources
- resource_availability
- bookings
- subscriptions
- embed_configurations

Define:
- Primary keys.
- Foreign keys.
- Relationships.
- Required and optional fields.
- Unique constraints.
- Indexes.
- Cascading behavior.
- Row Level Security policies.

Create a database diagram and save it in the repository as:

docs/DATABASE.md

Ensure that one organization cannot access another organization's private information.

Public visitors should only access information necessary for public booking.

Prevent double bookings using server-side validation and appropriate database constraints or transaction handling.

# 6. AGENTIC ENGINEERING REQUIREMENTS

I must demonstrate at least two agentic engineering techniques. Prefer implementing the following:

## A. Subagents
Create specialized agents for:
- Database architecture and review.
- Frontend implementation.
- Backend implementation.
- Code review and security review.

Explain how subagents work and when to delegate tasks.

## B. Skills
Create reusable skills for:
- Frontend development standards.
- Backend development standards.
- Testing and verification.

Explain how skills differ from CLAUDE.md.

## C. Hooks
Configure useful hooks, such as:
- Formatting after file changes where appropriate.
- Running relevant checks after implementation.
- Preventing common coding mistakes.

Explain when hooks execute and how to test them.

## D. MCP
Configure Playwright MCP if supported by the current Claude Code setup.

Use it to:
- Open the application in a browser.
- Test registration and login.
- Test workspace creation.
- Test public booking.
- Test booking management.
- Capture screenshots.

Explain MCP configuration and permissions before making changes.

## E. OpenSpec
If practical, introduce specification-driven development for feature planning.

Create specifications before implementing important features.

# 7. PARALLEL DEVELOPMENT

I must demonstrate at least one parallel development task.

Use Conductor if available, otherwise use separate Git branches and Claude Code sessions.

Suggested independent tasks:
- Frontend dashboard.
- Resource management.
- Booking interface.

Rules:
- Agree on interfaces and database contracts first.
- Avoid editing the same files in parallel.
- Use separate branches.
- Test each branch.
- Review changes.
- Merge carefully.
- Resolve conflicts without losing working functionality.

Explain the entire process.

# 8. GITHUB AND PROJECT DOCUMENTATION

Create and maintain:

CLAUDE.md
README.md
docs/DATABASE.md
docs/ARCHITECTURE.md
docs/PROJECT_REQUIREMENTS.md
docs/TESTING.md
docs/DEVELOPMENT_LOG.md

CLAUDE.md must contain:
- Project overview.
- Technology stack.
- Installation commands.
- Development commands.
- Testing commands.
- Coding standards.
- Security rules.
- Git conventions.
- Instructions for verifying changes.

README.md must eventually contain:
- Project description.
- Screenshots.
- Features completed.
- Features incomplete.
- Technology stack.
- Installation instructions.
- Environment variable instructions.
- Agentic tools used.
- Testing instructions.

Use meaningful Git commits and explain the purpose of important commits.

# 9. DEVELOPMENT PHASES

Follow this exact order:

Phase 1: Understand Claude Code and prepare the environment.

Phase 2: Create GitHub repository and initialize the project.

Phase 3: Define requirements and architecture.

Phase 4: Design database and relationships.

Phase 5: Create CLAUDE.md and project documentation.

Phase 6: Design the frontend and reusable UI components.

Phase 7: Implement authentication.

Phase 8: Implement workspace management.

Phase 9: Implement resource management.

Phase 10: Implement availability management.

Phase 11: Implement public booking functionality.

Phase 12: Implement booking management.

Phase 13: Implement dashboard analytics.

Phase 14: Implement embed widgets.

Phase 15: Implement Stripe billing.

Phase 16: Implement agentic tools and parallel development.

Phase 17: Perform complete testing and bug fixing.

Phase 18: Complete README, screenshots and submission reflection.

Do not skip phases.

You may adjust the order if a technical dependency requires it, but explain the reason first.

# 10. TESTING AND VERIFICATION

For every feature:

1. Review the requirements.
2. Prepare a test plan.
3. Implement the feature.
4. Run automated tests.
5. Test the interface manually or using Playwright.
6. Check edge cases.
7. Review security and authorization.
8. Fix identified problems.
9. Record the verification results.

Pay particular attention to:
- Authentication security.
- Database permissions.
- Organization data isolation.
- Public booking validation.
- Double booking prevention.
- Subscription limits.
- Stripe webhook verification.
- Responsive design.

Do not mark a feature complete unless it has been verified.

# 11. FINAL COURSE SUBMISSION

Prepare the project for evaluation.

Deliverables:

1. Public GitHub repository.
2. Complete README.md.
3. Database documentation.
4. Screenshots or 2–5-minute demonstration recording.
5. 200–300-word reflection explaining:
   - What worked well with Claude Code.
   - Where it made mistakes.
   - How I identified and fixed those mistakes.
   - What I would plan differently next time.

Also create a checklist to verify every assignment requirement before submission.

# 12. HOW TO START

IMPORTANT: DO NOT START CODING YET.

We are starting from absolute zero.

Your first response must:

1. Explain what Claude Code is.
2. Explain how it differs from regular Claude chat.
3. Explain how agentic engineering works.
4. Explain what software I need to install on my Windows computer.
5. Explain what Node.js, npm, Git, GitHub, VS Code and the terminal are.
6. Explain how these tools work together.
7. Give me the official installation resources.
8. Guide me through the setup one step at a time.
9. Tell me how to verify that each installation was successful.

Do not overwhelm me with all the instructions at once.

Start with the first step, explain it, and wait for me to complete it.

**My ultimate objective is not just to finish SlotMate. I want to become capable of independently planning, building, debugging, testing and delivering real-world software applications using Claude Code and agentic engineering.**