
### Funcionalidade Nova
Update the message generation logic in my project.

Requirements:
- DO NOT remove or change any existing functionality
- Keep all current logic working exactly as it is
- Only enhance the message formatting

Changes to implement:
1. Add emojis to improve the visual appeal of the messages (WhatsApp friendly)
2. Add a coupon section ABOVE the affiliate link

Coupon rules:
- If a valid coupon exists, display it like:
  🎟️ CUPOM: {coupon}
- If no coupon is available, display:
  🎟️ CUPOM: SEM CUPOM DISPONÍVEL


🔥 PROMOÇÃO
📦 {product_name}
💰 R$ {price}

🎟️ CUPOM: {coupon or fallback}

👉 LINK:
{affiliate_link}

Important:
- Do not break existing code
- Do not remove any current fields
- Only modify the message text output
- Keep compatibility with current data structure