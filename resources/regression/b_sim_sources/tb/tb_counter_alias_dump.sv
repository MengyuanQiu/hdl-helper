`timescale 1ns/1ps

module tb_counter_alias_dump;
    logic clk;
    logic rst_n;
    logic [3:0] cnt;

    dut_counter u_dut (
        .clk(clk),
        .rst_n(rst_n),
        .cnt(cnt)
    );

    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    initial begin
        // Intentionally not using top module name for dumpfile.
        $dumpfile("waves_alias.fst");
        $dumpvars(0, tb_counter_alias_dump);

        rst_n = 1'b0;
        repeat (2) @(posedge clk);
        rst_n = 1'b1;
        repeat (20) @(posedge clk);
        $finish;
    end
endmodule
