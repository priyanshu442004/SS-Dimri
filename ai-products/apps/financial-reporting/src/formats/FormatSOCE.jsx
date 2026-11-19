import React from "react";

const FormatSOCE = () => {
  return (
    <div className="bg-white text-black font-serif p-10 max-w-[1100px] mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-green-700">
          XYZ INFRASTRUCTURE & PROPERTIES LIMITED
        </h2>

        <h3 className="text-base font-bold mt-3">
          STATEMENT OF CHANGES IN EQUITY
        </h3>

        <p className="text-sm font-semibold mt-1">
          FOR THE PERIOD ENDED SEPTEMBER 30, 2025
        </p>

        <p className="text-xs mt-1">
          (All amounts are in ₹ millions, unless stated otherwise)
        </p>
      </div>

      {/* Section A */}
      <div className="mt-6">
        <h4 className="font-bold text-[15px] mb-2">
          A. EQUITY SHARE CAPITAL
        </h4>

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-2">Particulars</th>
              <th className="text-right py-2">No. of Shares</th>
              <th className="text-right py-2">Amount</th>
            </tr>
          </thead>

          <tbody>

            <tr>
              <td className="italic py-2">
                Equity shares of ₹ 10 each issued, subscribed and fully paid
              </td>
              <td className="text-right">-</td>
              <td className="text-right">-</td>
            </tr>

            <tr>
              <td className="font-semibold">As at April 01, 2023</td>
              <td className="text-right">1,08,25,177</td>
              <td className="text-right">108.25</td>
            </tr>

            <tr>
              <td className="pl-6 py-1">
                Change in Equity share capital during the year
              </td>
              <td className="text-right">-</td>
              <td className="text-right">-</td>
            </tr>

            <tr className="border-t border-black">
              <td className="font-semibold pt-2">As at March 31, 2024</td>
              <td className="text-right font-semibold">1,08,25,177</td>
              <td className="text-right font-semibold">108.25</td>
            </tr>

            <tr>
              <td className="pl-6 py-1">
                Change in Equity share capital during the year
              </td>
              <td className="text-right">5,41,25,885</td>
              <td className="text-right">216.50</td>
            </tr>

            <tr className="border-t border-black">
              <td className="font-semibold pt-2">As at March 31, 2025</td>
              <td className="text-right font-semibold">1,08,25,177</td>
              <td className="text-right font-semibold">108.25</td>
            </tr>

            <tr>
              <td className="pl-6 py-1">
                Change in Equity share capital during the year
              </td>
              <td className="text-right">5,41,25,885</td>
              <td className="text-right">216.50</td>
            </tr>

            <tr className="border-t-2 border-black">
              <td className="font-bold pt-2">As at September 30, 2025</td>
              <td className="text-right font-bold">6,49,51,062</td>
              <td className="text-right font-bold">324.76</td>
            </tr>

          </tbody>
        </table>
      </div>
      {/* Section B */}
      <div className="mt-10">
        <h4 className="font-bold text-[15px] mb-2">
          B. OTHER EQUITY
        </h4>

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-2">Particulars</th>
              <th className="text-right py-2">Capital Reserve</th>
              <th className="text-right py-2">Securities Premium</th>
              <th className="text-right py-2">General Reserve</th>
              <th className="text-right py-2">Retained Earnings</th>
              <th className="text-right py-2">FVTOCI Reserve</th>
              <th className="text-right py-2">Other Items</th>
              <th className="text-right py-2">Total Other Equity</th>
            </tr>
          </thead>

          <tbody>

            {/* As at April 01, 2023 */}
            <tr className="font-semibold">
              <td>As at April 01, 2023</td>
              <td className="text-right">12.52</td>
              <td className="text-right">763.28</td>
              <td className="text-right">34.63</td>
              <td className="text-right">4,136.89</td>
              <td className="text-right">24.39</td>
              <td className="text-right">-</td>
              <td className="text-right">4,971.71</td>
            </tr>

            <tr>
              <td className="pl-6">Profit for the year</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">665.66</td>
              <td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">665.66</td>
            </tr>

            <tr>
              <td className="pl-6">Dividend paid</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(10.83)</td>
              <td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(10.83)</td>
            </tr>

            <tr>
              <td className="pl-6">Change in fair value of investments, net of taxes</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">9.20</td>
              <td className="text-right">-</td>
              <td className="text-right">9.20</td>
            </tr>

            <tr>
              <td className="pl-6">Remeasurement of net defined benefits, net of taxes</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">-</td>
              <td className="text-right">(3.28)</td>
              <td className="text-right">(3.28)</td>
            </tr>

            <tr>
              <td className="pl-6">OCI reclassified to retained earnings</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(3.28)</td>
              <td className="text-right">-</td>
              <td className="text-right">3.28</td>
              <td className="text-right">-</td>
            </tr>

            <tr className="border-t border-black font-semibold">
              <td>Balance as at March 31, 2024</td>
              <td className="text-right">12.52</td>
              <td className="text-right">763.28</td>
              <td className="text-right">34.63</td>
              <td className="text-right">4,788.45</td>
              <td className="text-right">33.59</td>
              <td className="text-right">-</td>
              <td className="text-right">5,632.47</td>
            </tr>

            <tr>
              <td className="pl-6">Profit for the year</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">780.80</td>
              <td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">780.80</td>
            </tr>

            <tr>
              <td className="pl-6">Dividend paid</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(10.83)</td>
              <td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(10.83)</td>
            </tr>

            <tr>
              <td className="pl-6">Change in fair value of investments, net of taxes</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(4.07)</td>
              <td className="text-right">-</td>
              <td className="text-right">(4.07)</td>
            </tr>

            <tr>
              <td className="pl-6">Remeasurement of net defined benefits, net of taxes</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">-</td>
              <td className="text-right">(1.46)</td>
              <td className="text-right">(1.46)</td>
            </tr>

            <tr>
              <td className="pl-6">OCI reclassified to retained earnings</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(1.46)</td>
              <td className="text-right">-</td>
              <td className="text-right">1.46</td>
              <td className="text-right">-</td>
            </tr>

            <tr className="border-t border-black font-semibold">
              <td>Balance as at March 31, 2025</td>
              <td className="text-right">12.52</td>
              <td className="text-right">763.28</td>
              <td className="text-right">34.63</td>
              <td className="text-right">5,556.96</td>
              <td className="text-right">29.52</td>
              <td className="text-right">-</td>
              <td className="text-right">6,396.91</td>
            </tr>

            <tr>
              <td className="pl-6">Profit for the year</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">80.70</td>
              <td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">80.70</td>
            </tr>

            <tr>
              <td className="pl-6">Dividend paid</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(10.83)</td>
              <td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(10.83)</td>
            </tr>

            <tr>
              <td className="pl-6">Change in fair value of investments, net of taxes</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">5.04</td>
              <td className="text-right">-</td>
              <td className="text-right">5.04</td>
            </tr>

            <tr>
              <td className="pl-6">OCI reclassified to retained earnings</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(1.68)</td>
              <td className="text-right">-</td>
              <td className="text-right">1.68</td>
              <td className="text-right">-</td>
            </tr>

            <tr>
              <td className="pl-6">Bonus Issue</td>
              <td className="text-right">-</td>
              <td className="text-right">(216.50)</td>
              <td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td><td className="text-right">-</td>
              <td className="text-right">(216.50)</td>
            </tr>

            <tr className="border-t-2 border-black font-bold">
              <td>Balance as at September 30, 2025</td>
              <td className="text-right">12.52</td>
              <td className="text-right">546.78</td>
              <td className="text-right">34.63</td>
              <td className="text-right">5,625.15</td>
              <td className="text-right">34.56</td>
              <td className="text-right">-</td>
              <td className="text-right">6,253.64</td>
            </tr>

          </tbody>
        </table>
      </div>
      {/* Footer Section */}
      <div className="mt-12 text-[13px]">

        <div className="flex justify-between">
          <div>
            <p>Summary of material accounting policies</p>
            <p>The accompanying notes (4 to 48) referred above form an integral part of the standalone financial statement</p>
            <p className="mt-4">As per our report of even date</p>
          </div>

          <div className="text-right">
            <p>1-3</p>
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <div>
            <p className="font-semibold">for Agarwal & Saxena</p>
            <p>Chartered Accountants</p>
            <p>Firm Registration No.: 002405C</p>
          </div>

          <div className="text-right">
            <p>for and on behalf of Board of Directors</p>
            <p className="font-semibold">XYZ Infrastructure & Properties Limited</p>
            <p>CIN: U74899HR2000PLC043893</p>
          </div>
        </div>

        <div className="flex justify-between mt-10">
          <div>
            <p className="font-semibold">Akshay Sethi</p>
            <p>Partner</p>
            <p>Membership No.: 539439</p>
          </div>

          <div className="text-right">
            <p className="font-semibold">Pankaj Bajaj</p>
            <p>Managing Director</p>
            <p>DIN: 00024735</p>
          </div>

          <div className="text-right">
            <p className="font-semibold">Ranjit Khattar</p>
            <p>Director</p>
            <p>DIN: 00726997</p>
          </div>
        </div>

        <div className="flex justify-between mt-10">
          <div>
            <p>Place: New Delhi</p>
            <p>Date: {new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}</p>
          </div>

          <div className="text-right">
            <p className="font-semibold">Rajiv Khurana</p>
            <p>Chief Financial Officer</p>
            <p>ACA M.No.: 093132</p>
          </div>

          <div className="text-right">
            <p className="font-semibold">Swati Gupta</p>
            <p>Company Secretary</p>
            <p>ACS M.No.: A35294</p>
          </div>
        </div>

      </div>

    </div>
  );
};

export default FormatSOCE;
