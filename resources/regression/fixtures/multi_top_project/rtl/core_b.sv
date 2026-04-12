module core_b(
    input logic clk_i,
    output logic out_o
);
    assign out_o = ~clk_i;
endmodule
