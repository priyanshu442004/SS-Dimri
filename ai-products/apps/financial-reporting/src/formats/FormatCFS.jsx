import React from "react";

const FormatCFS = () => {
  return (
    <div className="bg-white text-black font-serif p-10 max-w-[1100px] mx-auto">

      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-green-700">
          XYZ INFRASTRUCTURE & PROPERTIES LIMITED
        </h2>
        <h3 className="text-base font-semibold mt-1">
          STANDALONE CASH FLOW STATEMENT
        </h3>
        <p className="text-sm mt-1">
          FOR THE PERIOD ENDED SEPTEMBER 30, 2025
        </p>
        <p className="text-xs mt-1">
          (All amounts are in ₹ millions, unless stated otherwise)
        </p>
      </div>

      {/* Table */}
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="text-left py-2">Particulars</th>
            <th className="text-right py-2 w-[150px]" colSpan="3">
              For the period ended
            </th>
          </tr>
          <tr className="border-b border-black">
            <th></th>
            <th className="text-right">September 30, 2025</th>
            <th className="text-right">March 31, 2025</th>
            <th className="text-right">March 31, 2024</th>
          </tr>
        </thead>

        <tbody>

          {/* A. Operating Activities */}
          <tr>
            <td colSpan="4" className="font-bold pt-4">
              A. Operating Activities
            </td>
          </tr>

          <tr>
            <td className="pl-6 py-1">Profit before tax</td>
            <td className="text-right">106.19</td>
            <td className="text-right">1,166.78</td>
            <td className="text-right">856.50</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">
              Adjustments to reconcile profit before tax to net cash flows:
            </td>
            <td></td><td></td><td></td>
          </tr>

          <tr>
            <td className="pl-10 py-1">Other comprehensive income</td>
            <td className="text-right">3.86</td>
            <td className="text-right">(6.70)</td>
            <td className="text-right">6.76</td>
          </tr>

          <tr>
            <td className="pl-10 py-1">
              Depreciation/ Impairment and amortization expense
            </td>
            <td className="text-right">4.30</td>
            <td className="text-right">8.37</td>
            <td className="text-right">8.87</td>
          </tr>

          <tr>
            <td className="pl-10 py-1">
              (Gain)/ loss on disposal of property, plant and equipment, net
            </td>
            <td className="text-right">0.00</td>
            <td className="text-right">(1.48)</td>
            <td className="text-right">(1.48)</td>
          </tr>

          <tr>
            <td className="pl-10 py-1">Finance costs</td>
            <td className="text-right">108.94</td>
            <td className="text-right">152.13</td>
            <td className="text-right">104.70</td>
          </tr>

          <tr>
            <td className="pl-10 py-1">Interest income</td>
            <td className="text-right">(198.26)</td>
            <td className="text-right">(1,014.68)</td>
            <td className="text-right">(758.00)</td>
          </tr>

          <tr>
            <td className="pl-10 py-1">Dividend income</td>
            <td className="text-right">(89.00)</td>
            <td className="text-right">(50.40)</td>
            <td className="text-right">(25.40)</td>
          </tr>

          <tr className="font-bold border-t border-black">
            <td className="py-2">
              Operating cash flow before working capital changes
            </td>
            <td className="text-right">(63.97)</td>
            <td className="text-right">255.50</td>
            <td className="text-right">191.88</td>
          </tr>

          {/* Working Capital */}
          <tr>
            <td className="pt-4 font-semibold">
              Changes in working capital:
            </td>
            <td></td><td></td><td></td>
          </tr>

          <tr>
            <td className="pl-6 py-1">Increase/ (decrease) in trade receivables</td>
            <td className="text-right">(8.18)</td>
            <td className="text-right">(40.54)</td>
            <td className="text-right">(49.46)</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">(Increase)/ decrease in inventories</td>
            <td className="text-right">(668.14)</td>
            <td className="text-right">(1,570.42)</td>
            <td className="text-right">(1,567.93)</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">
              (Increase)/ decrease in other financial assets
            </td>
            <td className="text-right">(327.08)</td>
            <td className="text-right">21.68</td>
            <td className="text-right">199.03</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">(Increase)/ decrease in loans</td>
            <td className="text-right">(1.22)</td>
            <td className="text-right">(1.58)</td>
            <td className="text-right">(0.36)</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">
              (Increase)/ decrease in other current assets/ Non-current assets
            </td>
            <td className="text-right">(166.22)</td>
            <td className="text-right">(68.47)</td>
            <td className="text-right">(57.80)</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">(Increase)/ decrease in trade payables</td>
            <td className="text-right">8.76</td>
            <td className="text-right">18.16</td>
            <td className="text-right">(71.32)</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">
              Increase/ (decrease) in other financial liabilities
            </td>
            <td className="text-right">2.74</td>
            <td className="text-right">19.03</td>
            <td className="text-right">(15.21)</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">
              Increase/ (decrease) in provisions
            </td>
            <td className="text-right">(283.91)</td>
            <td className="text-right">185.75</td>
            <td className="text-right">77.82</td>
          </tr>

          <tr>
            <td className="pl-6 py-1">
              Increase/ (decrease) in other current liabilities
            </td>
            <td className="text-right">849.60</td>
            <td className="text-right">494.63</td>
            <td className="text-right">(73.56)</td>
          </tr>

          <tr className="font-bold border-t border-black">
            <td className="py-2">Net cash generated from operating activities</td>
            <td className="text-right">(697.23)</td>
            <td className="text-right">(1,032.75)</td>
            <td className="text-right">(1,529.85)</td>
          </tr>


{/* ===================== B. Investing Activities ===================== */}

<tr>
  <td colSpan="4" className="font-bold pt-6">
    B. Investing activities
  </td>
</tr>

<tr>
  <td className="pl-6 py-1">Purchase of property, plant and equipment</td>
  <td className="text-right">(1.41)</td>
  <td className="text-right">(4.79)</td>
  <td className="text-right">(2.67)</td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Proceeds from sale of property, plant and equipment
  </td>
  <td className="text-right">0.00</td>
  <td className="text-right">0.00</td>
  <td className="text-right">1.90</td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Sales proceeds/ (Acquisition cost) from subsidiary/ other investments
  </td>
  <td className="text-right">106.70</td>
  <td className="text-right">(1,861.45)</td>
  <td className="text-right">(95.05)</td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Advances/loans given to subsidiaries & others
  </td>
  <td className="text-right">534.92</td>
  <td className="text-right">255.47</td>
  <td className="text-right">0.00</td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Maturities of (Investment in) bank deposit, net
  </td>
  <td className="text-right">63.81</td>
  <td className="text-right">(241.31)</td>
  <td className="text-right">(47.55)</td>
</tr>

<tr>
  <td className="pl-6 py-1">Dividend income</td>
  <td className="text-right">89.00</td>
  <td className="text-right">50.40</td>
  <td className="text-right">25.40</td>
</tr>

<tr>
  <td className="pl-6 py-1">Interest income</td>
  <td className="text-right">198.26</td>
  <td className="text-right">1,014.68</td>
  <td className="text-right">613.40</td>
</tr>

<tr className="font-bold border-t border-black">
  <td className="py-2">Net cash flows used in investing activities</td>
  <td className="text-right">991.28</td>
  <td className="text-right">(786.99)</td>
  <td className="text-right">495.43</td>
</tr>


{/* ===================== C. Financing Activities ===================== */}

<tr>
  <td colSpan="4" className="font-bold pt-6">
    C. Financing activities
  </td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Net proceeds/(payment) from/(to) long-term borrowings
  </td>
  <td className="text-right">(434.48)</td>
  <td className="text-right">423.76</td>
  <td className="text-right">(376.86)</td>
</tr>

<tr>
  <td className="pl-6 py-1">Net proceeds from short-term borrowings</td>
  <td className="text-right">122.78</td>
  <td className="text-right">1,681.43</td>
  <td className="text-right">1,494.63</td>
</tr>

<tr>
  <td className="pl-6 py-1">Proceeds from Issue of Bonus Shares</td>
  <td className="text-right">0.00</td>
  <td className="text-right">0.00</td>
  <td className="text-right">0.00</td>
</tr>

<tr>
  <td className="pl-6 py-1">Dividend paid</td>
  <td className="text-right">(10.83)</td>
  <td className="text-right">(10.83)</td>
  <td className="text-right">(10.82)</td>
</tr>

<tr>
  <td className="pl-6 py-1">Finance costs</td>
  <td className="text-right">(108.94)</td>
  <td className="text-right">(152.13)</td>
  <td className="text-right">(104.70)</td>
</tr>

<tr className="font-bold border-t border-black">
  <td className="py-2">Net cash flows from/ (used) in financing activities</td>
  <td className="text-right">(431.46)</td>
  <td className="text-right">1,942.22</td>
  <td className="text-right">1,002.25</td>
</tr>


{/* ===================== FINAL RECONCILIATION ===================== */}

<tr className="font-bold border-t-2 border-black">
  <td className="py-2">
    Net increase in cash and cash equivalents [(A)-(B)-(C)]
  </td>
  <td className="text-right">(137.41)</td>
  <td className="text-right">122.47</td>
  <td className="text-right">(32.17)</td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Cash and cash equivalents at the beginning of the year
  </td>
  <td className="text-right">161.37</td>
  <td className="text-right">38.90</td>
  <td className="text-right">71.06</td>
</tr>

<tr className="font-bold border-t border-black">
  <td className="py-2">
    Cash and cash equivalents at the end of the year
  </td>
  <td className="text-right">23.96</td>
  <td className="text-right">161.37</td>
  <td className="text-right">38.90</td>
</tr>
{/* ===================== COMPONENTS OF CASH ===================== */}

<tr>
  <td colSpan="4" className="font-bold pt-6">
    Components of cash and cash equivalents
  </td>
</tr>

<tr>
  <td className="pl-6 py-1">Cash in hand</td>
  <td className="text-right">1.78</td>
  <td className="text-right">2.41</td>
  <td className="text-right">2.36</td>
</tr>

<tr>
  <td className="pl-6 py-1">Balance with banks</td>
  <td className="text-right">22.17</td>
  <td className="text-right">158.96</td>
  <td className="text-right">36.54</td>
</tr>

<tr>
  <td className="pl-6 py-1">
    Deposits with original maturity of less than three months
  </td>
  <td className="text-right">0.00</td>
  <td className="text-right">0.00</td>
  <td className="text-right">0.00</td>
</tr>

<tr className="font-bold border-t border-black">
  <td className="py-2">Total cash and cash equivalents</td>
  <td className="text-right">23.95</td>
  <td className="text-right">161.37</td>
  <td className="text-right">38.90</td>
</tr>



       </tbody>
</table>

{/* ===================== NOTES ===================== */}

<div className="mt-8 text-[13px] leading-relaxed">

  <p className="font-bold underline mb-2">Notes:</p>

  <p className="mb-3">
    1. The above Standalone Statement Of Cash Flows has been prepared under
    the &ldquo;Indirect Method&rdquo; as set out in the Ind AS-7
    &ldquo;Statement of Cash Flows&rdquo;.
  </p>

  <p className="mb-4">
    2. Changes in liabilities arising from financing activities, including both
    changes arising from cash flows and non-cash changes:
  </p>

  {/* Financing Liabilities Table */}

  <table className="w-full border-collapse text-[13px]">
    <thead>
      <tr className="border-b border-black">
        <th className="text-left py-2">Particulars</th>
        <th className="text-right py-2">Long-term borrowings</th>
        <th className="text-right py-2">Short-term borrowings</th>
      </tr>
    </thead>

    <tbody>

      <tr>
        <td className="font-semibold pt-3">As at March 31, 2023</td>
        <td className="text-right">411.87</td>
        <td className="text-right">1,485.47</td>
      </tr>

      <tr>
        <td className="pl-6 py-1">
          Changes as per the Standalone Statement Of Cash Flows
        </td>
        <td className="text-right">(376.86)</td>
        <td className="text-right">1,494.63</td>
      </tr>

      <tr>
        <td className="pl-6 py-1">Non Cash Changes</td>
        <td className="text-right">0.00</td>
        <td className="text-right">0.00</td>
      </tr>

      <tr className="font-bold border-t border-black">
        <td className="pt-2">As at March 31, 2024</td>
        <td className="text-right">35.01</td>
        <td className="text-right">2,980.10</td>
      </tr>

      <tr>
        <td className="pl-6 py-1">
          Changes as per the Standalone Statement Of Cash Flows
        </td>
        <td className="text-right">423.76</td>
        <td className="text-right">1,681.43</td>
      </tr>

      <tr>
        <td className="pl-6 py-1">Non Cash Changes</td>
        <td className="text-right">0.00</td>
        <td className="text-right">0.00</td>
      </tr>

      <tr className="font-bold border-t border-black">
        <td className="pt-2">As at March 31, 2025</td>
        <td className="text-right">458.77</td>
        <td className="text-right">4,661.53</td>
      </tr>

      <tr>
        <td className="pl-6 py-1">
          Changes as per the Standalone Statement Of Cash Flows
        </td>
        <td className="text-right">(434.48)</td>
        <td className="text-right">122.78</td>
      </tr>

      <tr>
        <td className="pl-6 py-1">Non Cash Changes</td>
        <td className="text-right">0.00</td>
        <td className="text-right">0.00</td>
      </tr>

      <tr className="font-bold border-t border-black">
        <td className="pt-2">As at September 30, 2025</td>
        <td className="text-right">24.29</td>
        <td className="text-right">4,784.31</td>
      </tr>

    </tbody>
  </table>

</div>


{/* ===================== FOOTER ===================== */}

<div className="mt-12 text-[13px] leading-relaxed">

  {/* Accounting Policies Reference */}
  <div className="mb-4">
    <div className="flex justify-between">
      <p>Summary of material accounting policies</p>
      <p>1-3</p>
    </div>
    <p>
      The accompanying notes (4 to 48) referred above form an integral part of
      the standalone financial statement
    </p>
  </div>

  <p className="mb-6">As per our report of even date</p>

  {/* Auditor + Board */}
  <div className="flex justify-between mb-10">
    <div>
      <p className="font-semibold">For Agarwal & Saxena</p>
      <p>Chartered Accountants</p>
      <p>Firm Registration No.: 002405C</p>
    </div>

    <div>
      <p>for and on behalf of Board of Directors</p>
      <p className="font-semibold">
        XYZ Infrastructure & Properties Limited
      </p>
      <p>CIN: U74899HR2000PLC043893</p>
    </div>
  </div>

  {/* Signatories Row 1 */}
  <div className="grid grid-cols-3 gap-16 mb-10">
    <div>
      <p className="font-semibold">Akshay Sethi</p>
      <p>Partner</p>
      <p>Membership No.: 539439</p>
    </div>

    <div>
      <p className="font-semibold">Pankaj Bajaj</p>
      <p>Managing Director</p>
      <p>DIN: 00024735</p>
    </div>

    <div>
      <p className="font-semibold">Ranjit Khattar</p>
      <p>Director</p>
      <p>DIN: 00726997</p>
    </div>
  </div>

  {/* Signatories Row 2 */}
  <div className="grid grid-cols-3 gap-16 mb-8">
    <div></div>

    <div>
      <p className="font-semibold">Rajiv Khurana</p>
      <p>Chief Financial Officer</p>
      <p>ACA M.No.: 093132</p>
    </div>

    <div>
      <p className="font-semibold">Swati Gupta</p>
      <p>Company Secretary</p>
      <p>ACS M.No.: A35294</p>
    </div>
  </div>

  {/* Place & Date */}
  <div className="mt-6">
    <p>Place: New Delhi</p>
    <p>Date: {new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}</p>
  </div>

</div>



      
    </div>
  );
};

export default FormatCFS;
