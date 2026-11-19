import { dataStore } from "../services/dataStore.js";

export const processData = (req, res) => {
  try {
    const rows = dataStore.extracted;

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        processed: false,
        message: "No extracted data found"
      });
    }

    const result = rows.map((r, index) => {
      const basic = Number(r.basicAmount || 0);
      const received = Number(r.receivedAmount || 0);

      const receivedPercent = basic > 0
        ? ((received / basic) * 100).toFixed(2)
        : 0;

    const saleableAreaCondition = receivedPercent > 10 ? r.superBuiltUp : 0;
    const totalSaleConsiderationCondition = receivedPercent > 10 ? r.basicAmount : 0;

      return {
        srNo: index + 1,
        allotNo: r.bookingNo,
        name: r.customerName,
        project: "Flat",
        unitNo: r.unitCode,
        saleableArea: r.superBuiltUp,
        totalSaleConsideration: r.basicAmount,
        totalAmountDue: r.billAmount,
        amountReceived: received,
        outstanding: r.basicAmount - r.receivedAmount,
        amountReceivedPercent: Number(receivedPercent),
        saleableAreaCondition: saleableAreaCondition,
        totalSaleConsiderationCondition: totalSaleConsiderationCondition
      };
    });

    dataStore.extracted = [];

    return res.json({
      processed: true,
      records: result.length,
      data: result
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ processed: false });
  }
};
