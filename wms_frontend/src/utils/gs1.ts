// wms_frontend/src/utils/gs1.ts

interface GS1Data {
    sku?: string;
    lot?: string;
    expiry?: string;
    serial?: string;
}

export const parseGS1 = (barcode: string): GS1Data | null => {
    const result: GS1Data = {};
    let hasMatch = false;

    // Regex for Human Readable GS1: (01)123456(17)251231(10)LOT123
    const regex = /\((\d{2,4})\)([^()]+)/g;
    let match;

    while ((match = regex.exec(barcode)) !== null) {
        hasMatch = true;
        const ai = match[1];
        const val = match[2];

        switch (ai) {
            case '01': // GTIN -> SKU
                // Removing leading zeros if your SKUs don't use them (optional)
                result.sku = val; 
                break;
            case '10': // Batch / Lot
                result.lot = val;
                break;
            case '17': // Expiration Date (YYMMDD)
                if (val.length === 6) {
                    // Convert YYMMDD to YYYY-MM-DD
                    // Assumption: 20xx century
                    result.expiry = `20${val.substring(0, 2)}-${val.substring(2, 4)}-${val.substring(4, 6)}`;
                }
                break;
            case '21': // Serial Number
                result.serial = val;
                break;
        }
    }

    return hasMatch ? result : null;
};