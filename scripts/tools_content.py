"""Content and code for the general (non-platform) calculators."""

TOOLS = [
    {
        "slug": "price-after-fees-calculator",
        "title": "Price After Fees Calculator",
        "short": "What to charge so you still net your target after a % + fixed fee.",
        "h1": "Price After Fees Calculator",
        "lead": "Work backwards from the amount you want to keep. Enter the fee percentage and any fixed fee, and get the price to charge.",
        "form": """
<div class="field"><label for="t-net">Amount you want to keep</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="t-net" value="100" min="0" step="0.01"></div><span class="help">Your net after the platform or processor takes its cut.</span></div>
<div class="field"><label for="t-pct">Fee percentage</label><div class="input-wrap"><input type="number" inputmode="decimal" id="t-pct" value="2.9" min="0" max="99.9" step="0.01"><span class="adorn suffix">%</span></div><span class="help">For example 2.9 for Stripe or PayPal cards, 13.6 for eBay, 6.5 for Etsy's transaction fee.</span></div>
<div class="field"><label for="t-fixed">Fixed fee per sale</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="t-fixed" value="0.30" min="0" step="0.01"></div><span class="help">The flat part, like $0.30 per transaction. Enter 0 if there is none.</span></div>
""",
        "js": """
(function(){var n=document.getElementById('t-net'),p=document.getElementById('t-pct'),f=document.getElementById('t-fixed'),o=document.getElementById('tool-results');var fmt=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
function r(){var N=parseFloat(n.value)||0,P=parseFloat(p.value)||0,F=parseFloat(f.value)||0;if(P>=100){o.innerHTML='<p class="muted">The fee percentage must be under 100%.</p>';return;}
var price=(N+F)/(1-P/100);price=Math.ceil(price*100)/100;var fee=price*P/100+F;var net=price-fee;var naive=N*(1+P/100)+F;var naiveNet=naive-(naive*P/100+F);
o.innerHTML='<div class="headline"><div><div class="sub">Charge</div><div class="big">'+fmt.format(price)+'</div></div><div class="sub">to keep '+fmt.format(N)+'</div></div>'+
'<div class="kpis"><div class="kpi"><div class="k">Fee taken</div><div class="v">'+fmt.format(fee)+'</div></div><div class="kpi"><div class="k">Effective fee</div><div class="v">'+(price>0?(fee/price*100).toFixed(2):'0')+'%</div></div></div>'+
'<ul class="lines"><li><span class="n">Price charged</span><span class="amt">'+fmt.format(price)+'</span></li><li><span class="n">'+P+'% of price</span><span class="amt fee">−'+fmt.format(price*P/100)+'</span></li>'+(F?'<li><span class="n">Fixed fee</span><span class="amt fee">−'+fmt.format(F)+'</span></li>':'')+'<li class="total"><span class="n">You keep</span><span class="amt">'+fmt.format(net)+'</span></li></ul>'+
'<p class="hint">Rounded up to the nearest cent so you never fall short. Simply adding '+P+'% and the fixed fee to your target ('+fmt.format(naive)+') would leave you '+fmt.format(Math.max(0,N-naiveNet))+' short.</p>';}
[n,p,f].forEach(function(e){e.addEventListener('input',r);});r();})();
""",
        "body": [
            "Most people get this backwards. If Stripe takes 2.9% + $0.30 and you want to keep $100, charging $103.20 does not work: the fee is taken from the new, higher price, so you end up with $99.91. The price you need is <strong>(target + fixed fee) ÷ (1 − fee%)</strong>, which is $103.30 here.",
            "This calculator does that division for you and rounds up to the next cent. It works for any platform whose fee is a percentage plus an optional flat amount: card processors, marketplaces, payment apps and invoicing tools. If a platform stacks several fees (for example Etsy's 6.5% transaction fee plus 3% + $0.25 processing), add the percentages together and add the fixed parts together before entering them, or use that platform's own calculator, which handles the stacking exactly.",
            "Remember that some platforms charge their percentage on shipping and sales tax too, not only the item price. In that case, treat the whole amount the buyer pays as the price.",
        ],
        "formula": "price = (net_target + fixed_fee) ÷ (1 − fee_percent ÷ 100)",
        "formula_notes": [
            "Example with a 2.9% + $0.30 fee and a $100 target: (100 + 0.30) ÷ (1 − 0.029) = 100.30 ÷ 0.971 = $103.30. The fee on $103.30 is $3.30, leaving exactly $100.",
        ],
        "faq": [
            {"q": "Why can't I just add the fee percentage to my price?", "a": "Because the fee is charged on the final price, not on your target. Adding 2.9% to $100 gives $102.90, but 2.9% of $102.90 is $2.98, plus the $0.30 flat fee, so you keep $99.62. Dividing by (1 − 2.9%) instead accounts for the fee on the fee."},
            {"q": "What if the platform has two percentage fees?", "a": "If both apply to the same base (the sale price), add them: Etsy's 6.5% transaction fee and 3% payment processing become 9.5%, and the fixed parts ($0.20 listing + $0.25 processing) become $0.45. If one fee applies to an amount after another fee, use that platform's calculator on this site, which models the order correctly."},
            {"q": "Does this include sales tax?", "a": "No. Sales tax is collected on top of your price and usually remitted by the platform. Some platforms (eBay, Etsy, Depop) charge their fee on the tax as well, which slightly raises the effective fee; their calculators note this."},
            {"q": "Can I use this for invoices to clients?", "a": "Yes. If you invoice through Stripe, PayPal or Square and want the client to effectively cover the processing fee, this gives you the gross amount to bill. Check your state's rules and the processor's surcharging policy before labeling it as a surcharge on the invoice."},
            {"q": "Why does the result round up?", "a": "Fees are calculated to the cent and rounded by the platform. Rounding the price up guarantees you receive at least your target rather than a cent or two less."},
        ],
        "featured": ["stripe", "paypal", "square", "etsy", "ebay", "gumroad"],
    },
    {
        "slug": "profit-margin-calculator",
        "title": "Profit Margin Calculator",
        "short": "Margin and markup from cost and price, or the price for a target margin.",
        "h1": "Profit Margin Calculator",
        "lead": "Enter what an item costs you and what you sell it for. See gross profit, margin and markup, plus the price that hits a target margin.",
        "form": """
<div class="field"><label for="m-cost">Cost per item</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="m-cost" value="20" min="0" step="0.01"></div><span class="help">Everything it costs you to have one unit ready to sell: purchase price, inbound shipping, packaging.</span></div>
<div class="field"><label for="m-price">Selling price</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="m-price" value="50" min="0" step="0.01"></div></div>
<div class="field"><label for="m-fees">Fees per sale (optional)</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="m-fees" value="0" min="0" step="0.01"></div><span class="help">Platform and payment fees on this sale, if you want net margin instead of gross. Get the number from a platform calculator.</span></div>
<div class="field"><label for="m-target">Target margin</label><div class="input-wrap"><input type="number" inputmode="decimal" id="m-target" value="40" min="0" max="99.9" step="0.1"><span class="adorn suffix">%</span></div><span class="help">We'll show the price that achieves this margin after the fees above.</span></div>
""",
        "js": """
(function(){var c=document.getElementById('m-cost'),p=document.getElementById('m-price'),f=document.getElementById('m-fees'),t=document.getElementById('m-target'),o=document.getElementById('tool-results');var fmt=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
function r(){var C=parseFloat(c.value)||0,P=parseFloat(p.value)||0,F=parseFloat(f.value)||0,T=parseFloat(t.value)||0;var profit=P-C-F;var margin=P>0?profit/P*100:0;var markup=C>0?(P-C)/C*100:0;var tp=T<100?(C+F)/(1-T/100):0;
o.innerHTML='<div class="headline"><div><div class="sub">Profit per sale</div><div class="big'+(profit<0?' neg':'')+'">'+fmt.format(profit)+'</div></div><div class="sub">on a '+fmt.format(P)+' sale</div></div>'+
'<div class="kpis"><div class="kpi"><div class="k">'+(F?'Net margin':'Gross margin')+'</div><div class="v'+(margin<0?' neg':'')+'">'+margin.toFixed(1)+'%</div></div><div class="kpi"><div class="k">Markup on cost</div><div class="v">'+markup.toFixed(1)+'%</div></div></div>'+
'<ul class="lines"><li><span class="n">Selling price</span><span class="amt">'+fmt.format(P)+'</span></li><li><span class="n">Cost</span><span class="amt fee">−'+fmt.format(C)+'</span></li>'+(F?'<li><span class="n">Fees</span><span class="amt fee">−'+fmt.format(F)+'</span></li>':'')+'<li class="total"><span class="n">Profit</span><span class="amt'+(profit<0?' fee':'')+'">'+fmt.format(profit)+'</span></li></ul>'+
(tp?'<p class="hint">For a '+T+'% margin'+(F?' after fees':'')+', price at <strong>'+fmt.format(Math.ceil(tp*100)/100)+'</strong>.</p>':'');}
[c,p,f,t].forEach(function(e){e.addEventListener('input',r);});r();})();
""",
        "body": [
            "Margin and markup describe the same profit from two directions. <strong>Margin</strong> is profit as a share of the selling price; <strong>markup</strong> is profit as a share of cost. A $20 item sold for $50 has a 60% margin and a 150% markup. Sellers who confuse the two usually underprice: a \"40% markup\" on $20 is $28, which is only a 28.6% margin.",
            "Fees change the picture. Marketplaces typically take 10–15% of the sale, payment processors around 3%, and both come out of your price, not your cost. Enter the fee amount from your platform's calculator in the optional fees field to see the margin you actually keep, and the price you'd need for a target margin after fees.",
            "As a rule of thumb, resellers of used goods aim for a net margin of 40–60% to absorb returns, unsold inventory and their own time; retail arbitrage on new goods often runs at 15–30%; digital products and services can exceed 80% because there is no cost of goods.",
        ],
        "formula": "margin % = (price − cost − fees) ÷ price × 100    ·    markup % = (price − cost) ÷ cost × 100    ·    price for target margin = (cost + fees) ÷ (1 − margin)",
        "formula_notes": [],
        "faq": [
            {"q": "What is a good profit margin for reselling?", "a": "Most experienced resellers of used clothing, collectibles and electronics target a net margin of at least 40% after platform fees and shipping, because a share of items never sell or get returned. Lower margins can work for fast-moving, low-risk items."},
            {"q": "Is margin calculated on the price with or without shipping?", "a": "Use whatever the buyer pays you in total if the platform charges fees on shipping (eBay, Etsy, Whatnot do). If you charge shipping at cost and the platform doesn't fee it, leave it out of both price and cost."},
            {"q": "How do I convert markup to margin?", "a": "margin = markup ÷ (1 + markup). A 100% markup is a 50% margin; a 50% markup is a 33.3% margin; a 25% markup is a 20% margin."},
            {"q": "Should I include my time as a cost?", "a": "For a fair picture, yes. If sourcing, photographing, listing and shipping an item takes 30 minutes and you value your time at $20 an hour, add $10 to the cost. Many part-time sellers skip this, which is why the hourly rate of reselling is often lower than it feels."},
        ],
        "featured": ["ebay", "poshmark", "mercari", "amazon", "etsy", "whatnot"],
    },
    {
        "slug": "sales-fee-percentage-calculator",
        "title": "Fee Percentage Calculator",
        "short": "Find the effective fee rate you paid, from the gross amount and the payout.",
        "h1": "Fee Percentage Calculator",
        "lead": "You know what the buyer paid and what landed in your account. Find the effective fee rate, and check it against what the platform says it charges.",
        "form": """
<div class="field"><label for="f-gross">Amount the buyer paid</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="f-gross" value="120" min="0" step="0.01"></div><span class="help">Item plus shipping the buyer paid you, before sales tax the platform remits.</span></div>
<div class="field"><label for="f-net">Amount you received</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="f-net" value="103.28" min="0" step="0.01"></div><span class="help">Your payout for this order.</span></div>
<div class="field"><label for="f-fixed">Known fixed fee (optional)</label><div class="input-wrap"><span class="adorn">$</span><input type="number" inputmode="decimal" id="f-fixed" value="0" min="0" step="0.01"></div><span class="help">If the platform charges a flat amount per order (e.g. $0.30), enter it to separate the percentage part.</span></div>
""",
        "js": """
(function(){var g=document.getElementById('f-gross'),n=document.getElementById('f-net'),x=document.getElementById('f-fixed'),o=document.getElementById('tool-results');var fmt=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
function r(){var G=parseFloat(g.value)||0,N=parseFloat(n.value)||0,X=parseFloat(x.value)||0;var fee=G-N;var eff=G>0?fee/G*100:0;var pctPart=G>0?(fee-X)/G*100:0;
o.innerHTML='<div class="headline"><div><div class="sub">Effective fee</div><div class="big'+(fee<0?' neg':'')+'">'+eff.toFixed(2)+'%</div></div><div class="sub">'+fmt.format(fee)+' of '+fmt.format(G)+'</div></div>'+
'<div class="kpis"><div class="kpi"><div class="k">Total fee</div><div class="v">'+fmt.format(fee)+'</div></div><div class="kpi"><div class="k">'+(X?'Percentage part':'Fee per $100')+'</div><div class="v">'+(X?pctPart.toFixed(2)+'%':fmt.format(eff))+'</div></div></div>'+
'<p class="hint">'+(fee<0?'The payout is higher than the gross amount; check the numbers.':'Compare this with the platform\\'s published rate. If it is a few points higher, look for ad fees, international surcharges, a per-order fee, or a fee charged on sales tax.')+'</p>';}
[g,n,x].forEach(function(e){e.addEventListener('input',r);});r();})();
""",
        "body": [
            "Payout statements rarely show one clean percentage. A $120 eBay order that pays out $103.28 looks like a 13.9% fee, which is the 13.6% final value fee plus the $0.40 per-order fee — and if the buyer paid sales tax, the fee was charged on that too, so the rate on your item price looks higher still.",
            "Use this when a payout seems off. Enter the gross and the net, optionally the known fixed fee, and you get the effective rate to compare with the platform's fee page. Common reasons the number is higher than advertised: promoted-listing or ad fees, international or currency-conversion surcharges, fees charged on shipping and tax, subscription charges netted from payouts, and payment disputes.",
        ],
        "formula": "effective fee % = (gross − net) ÷ gross × 100",
        "formula_notes": [],
        "faq": [
            {"q": "Why is my effective fee higher than the platform's advertised rate?", "a": "Usually because the percentage is applied to more than your item price (shipping, sales tax), or because a per-order fixed fee, ad fee or international surcharge was added. Small orders feel it most: a $0.30 fixed fee is 3% of a $10 sale."},
            {"q": "Should I include sales tax in the gross amount?", "a": "Include it if the platform charges its fee on tax (eBay and Etsy do). Otherwise leave it out, since the platform collects and remits it and it never reaches your payout."},
            {"q": "Can I use this for card processing?", "a": "Yes. If a customer paid $100 and you received $96.80, the effective rate is 3.2% — consistent with 2.9% + $0.30. If you see 4.4%, an international-card or currency-conversion surcharge probably applied."},
            {"q": "What's the fastest way to check a platform's real fee?", "a": "Open that platform's calculator on this site, enter the same sale, and compare its fee lines with your payout statement. Each calculator links to the official fee page it was built from."},
        ],
        "featured": ["ebay", "etsy", "stripe", "paypal", "mercari", "depop"],
    },
]
