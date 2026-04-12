module tb_a;
    logic clk;
    logic out;

    core_a u_core_a (
        .clk_i(clk),
        .out_o(out)
    );

    initial begin
        clk = 1'b0;
        #5 clk = 1'b1;
    end
endmodule
