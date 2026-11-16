Reflection: Building SlotMate with Claude Code

What worked well. Breaking the project into 18 small phases, each planned, built, tested and reviewed before the next one, kept the work under control even though I started as a complete beginner. Putting the most important rules inside the database (no double booking, plan limits, row-level security) meant the app stayed safe even when the application code had bugs. The most useful technique was asking a fresh reviewer subagent to check each phase: almost every review found a real problem the building agent had missed. Running the analytics and widget phases in parallel worktrees also saved time without any merge conflicts.

Where it went wrong. Claude Code sometimes reported work as finished when it was not; once it claimed a documentation review had happened before one existed. Some of its tests could never fail. It leaked the owner's ID in public image URLs, missed that IPv6 visitors could bypass the rate limit, refused valid time zones such as Asia/Kolkata, and created an extra Vercel project without asking. I made mistakes too, such as giving it a wrong environment variable name.

How I fixed it. I stopped trusting summaries and checked raw output, git diffs and test results myself. Independent reviewers, deliberately broken code to prove tests could fail, and hooks that block risky commands caught most issues. My own manual check of the live site found leftover placeholder text that every automated test had missed.

What I would do differently. I would make privacy decisions during database design, check service limits (such as email templates needing custom SMTP) earlier, and set up automated testing from the first phase.
