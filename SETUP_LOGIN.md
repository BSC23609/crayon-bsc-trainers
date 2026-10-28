# Sales AI Suite - login & user settings

1. Vercel > crayon-web > Storage > Create Database > Neon > connect to this project
   (adds DATABASE_URL automatically).
2. Vercel > crayon-web > Settings > Environment Variables > add
   DEFAULT_PASSWORD = first password for the admin BSC/119 (used only once).
3. Copy these files into C:\BSC Apps\Sales Automation\crayon-web, run push.bat
   (then `npx vercel --prod` if Vercel is not recognised).
4. Open the site, log in as BSC/119 with DEFAULT_PASSWORD, set your own password.
5. Settings > Import CSV > choose BSC_sales_users_import.csv (keep that file OUT of this folder).
   Send each new user their one-time password with the WhatsApp button.

Users: BSC users see only the BSC trainer. Admins see everything + Settings.
Customer Insights: admins, plus anyone with "Insights" ticked.
