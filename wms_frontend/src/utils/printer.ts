// wms_frontend/src/utils/printer.ts
import qz from 'qz-tray';

export const printZPL = async (zplCode: string, printerName: string = "") => {
    try {
        if (!qz.websocket.isActive()) {
            await qz.websocket.connect();
        }

        // Find printer - if name provided use it, otherwise default
        const config = printerName 
            ? qz.configs.create(printerName) 
            : qz.configs.create(await qz.printers.getDefault());

        await qz.print(config, [zplCode]);
        console.log("Print sent successfully");
    } catch (err) {
        console.error("Printing failed", err);
        alert("Printer connection failed. Is QZ Tray running?");
    }
};