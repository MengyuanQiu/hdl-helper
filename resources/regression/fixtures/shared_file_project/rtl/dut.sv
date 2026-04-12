module dut(
    input logic clk_i,
    input logic [7:0] data_i,
    output logic [7:0] data_o
);
    assign data_o = data_i ^ {8{clk_i}};
endmodule
