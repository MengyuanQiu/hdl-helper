import * as vscode from 'vscode';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';

/**
 * 编码感知的文件读取工具
 * 支持自动探测 UTF-8 / GBK / GB2312 等常见编码，解决国内老牌 FPGA 项目中文乱码问题
 */
export class FileReader {
    // 用于编码探测的采样字节数 (前 4KB，平衡精度与性能)
    private static readonly DETECT_SAMPLE_SIZE = 4096;

    /**
     * 读取文件内容，自动探测并处理编码
     * @param uri 文件的 VS Code Uri
     * @returns 解码后的文本内容
     */
    public static async readFile(uri: vscode.Uri): Promise<string> {
        const rawBytes = await vscode.workspace.fs.readFile(uri);
        return FileReader.decodeBuffer(Buffer.from(rawBytes));
    }

    /**
     * 从原始 Buffer 解码文本，自动探测编码
     * @param buffer 原始字节 Buffer
     * @returns 解码后的文本
     */
    public static decodeBuffer(buffer: Buffer): string {
        // 1. 优先检查 BOM 标记 (Byte Order Mark)，这是最可靠的编码标识
        if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
            // UTF-8 with BOM
            return buffer.slice(3).toString('utf-8');
        }

        // 2. 对前 N 字节进行编码探测（只采样，避免大文件探测延迟）
        const sample = buffer.slice(0, FileReader.DETECT_SAMPLE_SIZE);
        const detected = jschardet.detect(sample);

        const encoding = (detected.encoding || 'UTF-8').toUpperCase();
        const confidence = detected.confidence || 0;

        // 3. 根据探测结果选择解码策略
        //    置信度低于 0.6 时，降级到 UTF-8 避免误判
        if (confidence > 0.6 && FileReader.isGbkFamily(encoding)) {
            // 国标码系列：GBK / GB2312 / GB18030 / EUC-CN
            return iconv.decode(buffer, 'gbk');
        } else if (confidence > 0.6 && encoding === 'UTF-16LE') {
            return iconv.decode(buffer, 'utf-16le');
        } else if (confidence > 0.6 && encoding === 'UTF-16BE') {
            return iconv.decode(buffer, 'utf-16be');
        } else {
            // 默认 UTF-8 (包括 ASCII，因为 ASCII 是 UTF-8 的子集)
            return buffer.toString('utf-8');
        }
    }

    /**
     * 判断编码名称是否属于 GBK 家族
     */
    private static isGbkFamily(encoding: string): boolean {
        return (
            encoding === 'GB2312' ||
            encoding === 'GBK' ||
            encoding === 'GB18030' ||
            encoding === 'EUC-CN' ||
            encoding === 'HZ-GB-2312'
        );
    }
}
