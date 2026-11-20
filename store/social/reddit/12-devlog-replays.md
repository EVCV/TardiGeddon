When: Wed 16 Dec, 15:00 UK · Flair: 📰 News
Title: Every match is 50 button presses a second (and that's why replays are tiny)
---
A TardiGeddon match isn't saved as a video. It's saved as a list of what each player pressed, **50 times a second**. To watch a replay, the game plays the whole match again from the start with the same presses, and gets exactly the same result.

That only works if the game never does anything unpredictable, which turned out to be a fun puzzle.

**No real randomness.** Wind, mines that might be duds, crate drops: they all come from a seeded sequence that's the same every time the match is played.

**No maths that can differ between devices.** Sines and cosines can give very slightly different answers on different phones and computers. "Very slightly" is enough to send a grenade the other way after a few bounces. So the game measures angles in whole numbers (4,096 to a circle) and uses its own tables built from basic arithmetic.

**Weather is just for looks.** Rain, snow and fog never move your shots, because then two people's screens could disagree. (The very rare tornado is the exception, and it does exactly the same thing on everyone's screen.)

**The same trick runs online play.** The server sends everyone the same button presses, and every device works out the same match by itself. It's also how the CPU can try out shots before it takes one (last week's post).

This is the bit we're most proud of, so ask us anything about it.
