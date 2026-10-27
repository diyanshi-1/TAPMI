# Deploying the TAPMI frontend on Netlify

Netlify builds the React/Vite frontend in `frontend/dist`. It does not start the Flask API or provide the PostgreSQL database. The frontend needs a separately deployed Flask API before sign-in and other server-backed features can work.

## Connect the frontend to the API

1. Deploy the Flask backend on a service that can run this repository's `Dockerfile` or Python application, and connect it to a persistent PostgreSQL database.
2. Check that `https://YOUR_API_HOST/api/v1/health` returns JSON with `status: "healthy"` and `database.connected: true`.
3. In the Netlify site's environment variable settings, add this variable with the **Builds** scope enabled:

   ```text
   VITE_API_BASE_URL=https://YOUR_API_HOST/api/v1
   ```

   Use the API's public HTTPS origin and include `/api/v1`. This value is a public API address, not a secret.

4. Trigger a new Netlify deploy. Vite embeds `VITE_*` values during the build, so changing the variable requires rebuilding the site.

Local development can leave `VITE_API_BASE_URL` unset; the frontend then uses `/api/v1`, which Vite proxies to the local Flask server on port 5000.

If the API health check succeeds but browser sign-in still fails, check the browser console for a CORS error and confirm the backend allows the Netlify site's origin. Also ensure the deployed database has been migrated and contains the account you are trying to use; Netlify does not share the local development database.
