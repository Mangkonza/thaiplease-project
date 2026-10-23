# ThaiPlease frontend

React + Vite web application for citizens, merchants, and administrators.

## Run locally

1. Start the backend API at `http://localhost:5000` and make sure PostgreSQL is available.
2. From this directory, run `npm ci`.
3. Set `VITE_API_BASE_URL` if the API is not at its default URL (`http://localhost:5000/api/v1`).
4. Run `npm run dev`.

Use `npm run lint` and `npm run build` to validate frontend changes.

## Main flows

- Citizens can search active shops, view a shop, make a simulated payment, and review coin and payment history.
- Merchants can submit shops for approval and manage AI-suggested campaigns for active shops.
- Administrators can approve or reject pending shops and review audit logs.

Campaign suggestions require the backend AI integration to be configured. Shop approval, payments, coin rewards, and campaign actions are persisted by the backend API.
