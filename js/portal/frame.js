// Portal pages must not run inside someone else's frame (clickjacking: a hidden "Accept quotation" click).
// GitHub Pages can't send X-Frame-Options or frame-ancestors, so the page stays hidden (style #no-frame,
// set by build.mjs) unless it is the top window.
if (window.self === window.top) document.getElementById('no-frame')?.remove();
else window.top.location = window.self.location.href;
