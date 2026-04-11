import { HdlModule, HdlPort, HdlParam } from '../project/hdlSymbol';

export class TestbenchGenerator {
    public static generate(module: HdlModule): string {
        const name = module.name;
        const ports = module.ports;
        const params = module.params;

        // 1. 智能识别时钟和复位端口
        let clockPort = 'clk';
        let resetPort = 'rst_n';

        // 简单的启发式搜索
        const foundClk = ports.find(p => /clk|clock/i.test(p.name));
        if (foundClk) {clockPort = foundClk.name;}

        const foundRst = ports.find(p => /rst|reset/i.test(p.name));
        if (foundRst) {resetPort = foundRst.name;}

        // 2. 构建 TB 内部信号声明
        // 规则: Input -> reg/logic (TB驱动), Output -> wire/logic (TB观测)
        // 这里统一用 logic，SystemVerilog 的优势
        const signalDecls = ports
            .filter(p => p.name !== clockPort && p.name !== resetPort)
            .map(p => {
                // p.type 已经在 FastParser 里处理成了 "wire [31:0]" 或 "logic"
                // 我们只需要提取位宽部分，比如 "[31:0]"
                // 简单的正则提取位宽:
                const widthMatch = p.type.match(/\[.*?\]/);
                const width = widthMatch ? ` ${widthMatch[0]}` : '';
                return `    logic${width} ${p.name};`;
            })
            .join('\n');

        // 3. 构建实例化连线
        const maxNameLen = Math.max(...ports.map(p => p.name.length), 0) + 1;
        
        const instanceConnections = ports.map((p, index) => {
            let connectTo = p.name;
            // 映射时钟复位
            if (p.name === clockPort) {connectTo = 'clk';}
            if (p.name === resetPort) {connectTo = 'rst_n';}
            
            const padding = ' '.repeat(Math.max(0, maxNameLen - p.name.length));
            const comma = index === ports.length - 1 ? '' : ',';
            return `        .${p.name}${padding} (${connectTo})${comma}`;
        }).join('\n');

        // 4. 构建参数传递
        let paramStr = '';
        if (params.length > 0) {
            const pList = params.map(p => `.${p.name}(${p.defaultValue})`).join(', ');
            paramStr = ` #(${pList})`;
        }

        // 5. 构建参数定义 (Localparams)
        const paramDecls = params.map(p => 
            `    localparam ${p.name} = ${p.defaultValue};`
        ).join('\n');

        // --- 模板输出 ---
        return `\`timescale 1ns/1ps

module tb_${name};

    // -------------------------------------------------------------------------
    // 1. Parameters & Constants
    // -------------------------------------------------------------------------
    localparam float CLK_PERIOD = 10.0; // Float for precision
    localparam int   TIMEOUT    = 50000; // Cycles watchdog
    
${paramDecls}

    // -------------------------------------------------------------------------
    // 2. Signals & Interface
    // -------------------------------------------------------------------------
    logic clk;
    logic rst_n;

    // DUT Signals
${signalDecls}

    // -------------------------------------------------------------------------
    // 3. DUT Instantiation
    // -------------------------------------------------------------------------
    ${name}${paramStr} u_dut (
${instanceConnections}
    );

    // -------------------------------------------------------------------------
    // 4. Clock & Reset Generation
    // -------------------------------------------------------------------------
    initial begin
        clk = 0;
        forever #(CLK_PERIOD/2.0) clk = ~clk;
    end

    // Task: Standard Reset Sequence
    task apply_reset();
    begin
        $display("[%0t] Reset Asserted...", $time);
        rst_n = 0;
        repeat(10) @(posedge clk);
        @(negedge clk); // Release on negedge
        rst_n = 1;
        $display("[%0t] Reset Released...", $time);
    end
    endtask

    // -------------------------------------------------------------------------
    // 5. Main Test Process
    // -------------------------------------------------------------------------
    initial begin
        // 5.1 Waveform Dump
        \`ifdef DUMP_VCD
            $dumpfile("tb_${name}.vcd");
            $dumpvars(0, tb_${name});
        \`endif
        \`ifdef DUMP_FSDB
            $fsdbDumpfile("tb_${name}.fsdb");
            $fsdbDumpvars(0, tb_${name});
        \`endif

        // 5.2 Test Sequence
        apply_reset();

        $display("[%0t] Test Started...", $time);
        
        // TODO: Add your driver logic here
        repeat(100) @(posedge clk);

        // 5.3 End of Simulation
        $display("[%0t] TEST PASSED", $time);
        $finish;
    end

    // -------------------------------------------------------------------------
    // 6. Watchdog (Safety Net)
    // -------------------------------------------------------------------------
    initial begin
        repeat(TIMEOUT) @(posedge clk);
        $display("\\nError: Simulation Timeout after %0d cycles!", TIMEOUT);
        $display("[%0t] TEST FAILED (TIMEOUT)", $time);
        $fatal;
    end

endmodule
`;
    }
}