module tb_shared;
    logic clk;
    logic [7:0] data_i;
    logic [7:0] data_o;

    dut u_dut (
        .clk_i(clk),
        .data_i(data_i),
        .data_o(data_o)
    );

    initial begin
        clk = 1'b0;
        data_i = 8'hA5;
        #5 clk = 1'b1;
    end
endmodule
