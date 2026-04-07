-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "auth" JSONB,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "variables" JSONB;

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "auth" JSONB,
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "variables" JSONB;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "auth" JSONB,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "params" JSONB,
ADD COLUMN     "postRequestScript" TEXT,
ADD COLUMN     "preRequestScript" TEXT;
