const cron = require('node-cron');
const Contract = require('../models/Contract');
const Property = require('../models/Property');

const startContractScheduler = () => {
  // Runs every day at 00:00 (Midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      const today = new Date();

      // Find active contracts where the end date has passed
      const expiredContracts = await Contract.find({
        status: 'Active',
        endDate: { $lt: today },
      });

      for (const contract of expiredContracts) {
        // Mark contract as Completed
        contract.status = 'Completed';
        await contract.save();

        // Release the linked property back to Available
        if (contract.property) {
          await Property.findByIdAndUpdate(contract.property, { status: 'Available' });
        }
      }

      if (expiredContracts.length > 0) {
        console.log(`[Cron Job] Successfully transitioned ${expiredContracts.length} expired contracts to Completed.`);
      }
    } catch (error) {
      console.error('[Cron Job Error] Failed to process expired contracts:', error.message);
    }
  });
};

module.exports = startContractScheduler;