/* ================== Yang Borsası kartları: prod verisi (yalnız --prod derlemesinde) ==================
   Ekranlar ortak: 51-borsa-kart.js (kart ızgarası her genişlikte, AL / SAT pencereleri, bekleyen işlem kartları). Burada yalnız prod'a
   özgü olanlar: net stok ve sıra başı sunucudan (GET exchange → net: satışta − eşlenmemiş açık sipariş, book), başlık çipi (canlı destek
   P6'ya kadar sade bilgi). Yükleme durumu: 97p4-ex.js p4Exchange.                                                                                 */
P4.stock = P4.stock || {}; P4.net = P4.net || {};
{ const f = p4ApplyEx; p4ApplyEx = function (d) { f.apply(this, arguments); if (d && d.stock) P4.stock = d.stock; if (d && d.net) P4.net = d.net; }; }
/** Net stok: sunucunun net haritası (önce sıradaki siparişler alır); yoksa satış sırasından */
BXD.net = x => P4.net && P4.net[x.id] != null ? Math.max(0, +P4.net[x.id] || 0) : exStock(x);
BXD.chip = () => '<span class="chip ok">● Siparişler sırayla işlenir</span>';

