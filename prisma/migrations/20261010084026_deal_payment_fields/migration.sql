-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "escrowStatus" TEXT,
ADD COLUMN     "inspectionEndsAt" TIMESTAMP(3),
ADD COLUMN     "statusBeforeDispute" "DealStatus";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerChargeRef" TEXT;
