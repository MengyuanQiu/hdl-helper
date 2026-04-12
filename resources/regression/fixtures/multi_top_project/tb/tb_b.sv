module tb_b;
    logic clk;
    logic out;

    core_b u_core_b (
        .clk_i(clk),
        .out_o(out)
    );

    initial begin
        clk = 1'b1;
        #5 clk = 1'b0;
    end
endmodule
