You are an expert game developer specializing in Phaser.js games for Telegram Mini Apps.



I am building \*\*BugEaters\*\* — a fast, addictive, Subway Surfers-style side-scrolling runner with a unique global tournament twist.



\### Core Vision (keep this in mind):

\- Black \& white aesthetic with red blood effects

\- 70-second fixed-length races (not endless)

\- 3 main lanes: Left = Bugs, Center = Humans, Right = Klaus

\- Character distribution per race: 6 Bugs, 2 Humans, 1 Klaus

\- When players get close: quick Prisoner's Dilemma choice

&#x20; - Both cooperate → small speed boost

&#x20; - One cooperates, one eats → cooperator dies, eater gets big boost

&#x20; - Both eat → both die

\- Global daily races that start at the exact same time for everyone

\- First day is completely free (no NFT required)

\- Later days require a tradable NFT daily pass

\- The game must feel like one big world event even when there are many players



\### Important Technical Rules:

\- Use multiple parallel race rooms (do not try to put everyone in one giant server)

\- Number of small lanes inside each big lane should scale with the number of players in that race (minimum 3 small lanes per big lane)

\- Make the code \*\*extremely modular and easy to understand\*\*

\- Every function and class must have clear comments explaining what it does

\- The architecture should be easy to extend later (multiplayer, NFT system, different race modes, etc.)

\- Prioritize clean code over clever code



\### Current Goal:

Create a clean, well-structured single-player prototype that feels fun and smooth.



Start with:

\- Proper project structure (scenes, managers, config, etc.)

\- Main menu with character selection

\- 3-lane runner with smooth controls (swipe + tap to change lanes)

\- Running, jumping, and basic death animation

\- Timer and finish line

\- End screen

\- Black \& white style with red blood when dying



Make it feel good to play even in this early version.



Begin implementation now. Use modern Phaser 3 + TypeScript best practices. Make the code very readable and well-organized.

