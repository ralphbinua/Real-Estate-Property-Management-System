const Invoice = require('../models/Invoice');
const Contract = require('../models/Contract');
const SystemSettings = require('../models/SystemSettings');

// Helper function to calculate late fees based on SystemSettings
const applyLateFees = async (invoices) => {
  const settings = (await SystemSettings.findOne()) || {};
  const graceDays = settings.gracePeriodDays ?? 5;
  const lateFeePct = settings.lateFeePercentage ?? 5;

  const now = new Date();

  for (const invoice of invoices) {
    if (invoice.status !== 'Paid') {
      const gracePeriodEnd = new Date(invoice.dueDate);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + graceDays);

      // If past due date + grace period and not paid, calculate late fee
      if (now > gracePeriodEnd) {
        const fee = (invoice.amount * lateFeePct) / 100;
        invoice.lateFee = fee;
        invoice.totalDue = invoice.amount + fee;
        invoice.status = 'Overdue';
        await invoice.save();
      }
    }
  }
};

// Generate invoices for all active contracts
exports.generateMonthlyInvoices = async (req, res) => {
  try {
    const settings = (await SystemSettings.findOne()) || {};
    const graceDays = settings.gracePeriodDays ?? 5;

    const activeContracts = await Contract.find({ status: 'Active' });
    let createdCount = 0;

    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 10);
    if (dueDate < now) {
      dueDate.setDate(dueDate.getDate() + graceDays);
    }

    for (const contract of activeContracts) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const existingInvoice = await Invoice.findOne({
        contract: contract._id,
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      });

      if (!existingInvoice) {
        await Invoice.create({
          contract: contract._id,
          tenant: contract.tenant,
          property: contract.property,
          amount: contract.rentAmount,
          lateFee: 0,
          totalDue: contract.rentAmount,
          dueDate: dueDate,
          status: 'Pending',
        });
        createdCount++;
      }
    }

    res.json({ message: `Successfully generated ${createdCount} new invoices.` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate monthly invoices.' });
  }
};

// Fetch all invoices (Filtered for Property Manager view)
exports.getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate('tenant', 'name email')
      .populate('property', 'title address')
      .sort({ createdAt: -1 });

    await applyLateFees(invoices);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invoices.' });
  }
};

// Fetch invoices for the logged-in tenant
exports.getTenantInvoices = async (req, res) => {
  try {
    const tenantId = req.user?._id || req.query.tenantId;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required.' });
    }

    // Match either by tenant ID directly or cast string
    const invoices = await Invoice.find({ tenant: tenantId })
      .populate('tenant', 'name email')
      .populate('property', 'title address')
      .sort({ createdAt: -1 });

    await applyLateFees(invoices);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch tenant invoices.' });
  }
};

// Update invoice status (e.g. Mark as Paid by Property Manager)
exports.updateInvoiceStatus = async (req, res) => {
  try {
    const { status, paymentMethod, remarks } = req.body;
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    invoice.status = status || invoice.status;
    invoice.paymentMethod = paymentMethod || invoice.paymentMethod;
    invoice.remarks = remarks !== undefined ? remarks : invoice.remarks;

    if (status === 'Paid') {
      invoice.paidAt = new Date();
    }

    await invoice.save();
    res.json({ message: 'Invoice status updated successfully.', invoice });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update invoice.' });
  }
};

// Tenant submits proof of payment receipt
exports.submitPaymentReceipt = async (req, res) => {
  try {
    const { paymentMethod, referenceNumber, receiptUrl } = req.body;
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    invoice.paymentMethod = paymentMethod || invoice.paymentMethod;
    invoice.remarks = referenceNumber ? `Ref: ${referenceNumber}` : invoice.remarks;
    invoice.receiptUrl = receiptUrl || '';
    invoice.status = 'Pending Verification';

    await invoice.save();
    res.json({ message: 'Payment receipt submitted successfully!', invoice });
  } catch (err) {
    res.status(500).json({ message: 'Failed to submit payment receipt.' });
  }
};