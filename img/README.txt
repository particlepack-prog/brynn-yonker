DROP REAL IMAGES HERE. No code changes needed.

The HTML already points at these exact paths. Add a file and it appears;
leave it missing and a designed placeholder shows instead.

  img/brynn-portrait.jpg          About section portrait. Portrait crop,
                                  roughly 4:5 (e.g. 800x1000). On set with
                                  the boom is ideal.

  img/audiobooks/<slug>.jpg       Square cover art, 600x600 or larger:
                                    run-with-the-wind.jpg
                                    sisters-in-science.jpg
                                    x-men-soul-killer.jpg
                                    the-good-allies.jpg
                                    sandy-hook.jpg
                                    superfan.jpg

  og-image.png                    Social share card (already generated).
                                  Replace if you want a photo-based one.

Video thumbnails on the Work pages currently load from YouTube. To host them
yourself instead, save them into img/work/ and update the src attributes in
work/production-sound.html, work/sound-design.html and work/sound-scout.html.

Keep files under ~400KB each; resize before adding rather than relying on CSS.
