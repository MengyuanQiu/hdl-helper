module dut(
    input logic clk_i,
    input logic rst_ni,
    output logic done_o
);
    assign done_o = clk_i & rst_ni;
endmodule
