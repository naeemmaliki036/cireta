/** Bundled fallback used when the platform settings API is unavailable
 *  or hasn't been customised. Kept in sync with the same string in
 *  apps/admin/src/app/platform/settings/page.tsx. */
export const DEFAULT_OTC_TEMPLATE = `<h2>OTC & Bank Transfer Instructions</h2>
<p>This sale accepts purchases via bank wire transfer and OTC allocation.</p>
<h3>Wire Transfer Details</h3>
<ul>
<li><strong>Beneficiary:</strong> Cireta Holdings Ltd</li>
<li><strong>Bank:</strong> [Bank Name]</li>
<li><strong>IBAN:</strong> [IBAN]</li>
<li><strong>SWIFT/BIC:</strong> [SWIFT Code]</li>
<li><strong>Reference:</strong> Your registered email address</li>
</ul>
<h3>Process</h3>
<ol>
<li>Complete KYC verification on the platform</li>
<li>Initiate a wire transfer with the details above</li>
<li>Email confirmation to <strong>otc@cireta.com</strong> with your transfer receipt</li>
<li>Tokens will be allocated within 2-3 business days of confirmed receipt</li>
</ol>
<h3>Minimum Purchase</h3>
<p>Bank transfer minimum: <strong>$5,000</strong></p>
<h3>Large Allocations ($50,000+)</h3>
<p>For allocations over $50,000, contact our OTC desk directly for preferential pricing and dedicated support:</p>
<ul>
<li><strong>Email:</strong> otc@cireta.com</li>
<li><strong>Response time:</strong> Within 2 business hours</li>
</ul>`;
